from rest_framework import viewsets, permissions, status
from django.contrib.auth.models import User
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework import serializers
from django.http import FileResponse, StreamingHttpResponse
import threading
from django.utils import timezone
from datetime import timedelta
from .models import FileTransfer, Folder, FileAccess, FolderAccess, ShareLink
from .serializers import (
    FileTransferSerializer,
    FolderSerializer,
    FileAccessSerializer,
    FolderAccessSerializer,
    ShareLinkSerializer,
)
from django.db.models import Q
from django.core.cache import cache
from .security_utils import (
    load_security_config,
    scan_archive_contents,
    scan_file_for_malware
)
from .thumbnail_utils import is_image_file, is_video_file, generate_thumbnail, generate_video_thumbnail, get_thumbnail_filename
import os
import zipfile
import tempfile
from io import BytesIO

# Load security configuration
SECURITY_CONFIG = load_security_config()

class FolderViewSet(viewsets.ModelViewSet):
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    pagination_class = None  # Deshabilitar paginación para mostrar todas las carpetas

    def get_queryset(self):
        user = self.request.user
        from django.db.models import Prefetch
        
        # Prefetch unviewed files that the user can access for has_new_content optimization
        unviewed_files_prefetch = Prefetch(
            'files',
            queryset=FileTransfer.objects.filter(
                is_viewed=False
            ).filter(
                Q(owner=user) | 
                Q(uploader=user) | 
                Q(access_list__granted_to=user) |
                Q(folder__access_list__granted_to=user)
            ).distinct().only('id'),
            to_attr='unviewed_files_for_user'
        )
        
        queryset = Folder.objects.filter(
            Q(owner=user) | Q(access_list__granted_to=user)
        ).select_related('owner', 'uploader').prefetch_related(
            'access_list',
            unviewed_files_prefetch
        ).distinct()

        # Apply scope filtering for list views
        if self.action in ['list', None]:  # None for default list action
            scope = self.request.query_params.get('scope', 'mine')
            
            if scope == 'shared':
                queryset = queryset.filter(access_list__granted_to=user).exclude(owner=user)
            elif scope == 'sent':
                # Para carpetas, el scope 'sent' no aplica porque las carpetas no tienen uploader
                # Solo los archivos pueden ser 'enviados'. Retornar vacío para carpetas.
                queryset = queryset.none()
            else:  # 'mine' or default
                # Mi unidad: mostrar todas las carpetas relacionadas con el usuario
                # (propias y compartidas con él)
                # El get_queryset() ya filtra por owner y accesos
                pass
            
            # Only apply parent filtering for list views, not for detail/retrieve views
            parent_id = self.request.query_params.get('parent')
            if parent_id == 'null':
                queryset = queryset.filter(parent__isnull=True)
            elif parent_id:
                queryset = queryset.filter(parent_id=parent_id)
            else:
                # Default to top-level folders owned or shared
                queryset = queryset.filter(parent__isnull=True)

        return queryset
        
    def perform_create(self, serializer):
        """
        Handle folder creation with inheritance of ownership and access
        """
        folder_data = serializer.validated_data
        parent_folder = folder_data.get('parent')
        
        # Determine the owner based on parent folder
        if parent_folder:
            # If creating inside a shared folder, use the parent's owner
            owner = parent_folder.owner
            uploader = self.request.user
        else:
            # If creating at root level, creator is both owner and uploader
            owner = self.request.user
            uploader = self.request.user
        
        # Save with proper ownership
        instance = serializer.save(owner=owner, uploader=uploader)
        
        # If created inside a shared folder, inherit access
        if parent_folder:
            self._inherit_folder_access(instance, parent_folder)

    def _get_folder_permission(self, user, folder: Folder) -> str:
        """Get the permission level for a user on a folder"""
        if user.is_anonymous:
            return 'none'
        
        # Owner has full permissions
        if folder.owner_id == user.id:
            return 'edit'
        
        # Check folder access
        folder_access = folder.access_list.filter(granted_to=user).first()
        if folder_access:
            return folder_access.permission
        
        return 'none'

    def update(self, request, *args, **kwargs):
        """Override update to check permissions for renaming folders"""
        instance = self.get_object()
        
        # Check if user has edit permission
        permission = self._get_folder_permission(request.user, instance)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para renombrar esta carpeta'
            }, status=status.HTTP_403_FORBIDDEN)
        
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """Override partial_update to check permissions for renaming folders"""
        instance = self.get_object()
        
        # Check if user has edit permission
        permission = self._get_folder_permission(request.user, instance)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para renombrar esta carpeta'
            }, status=status.HTTP_403_FORBIDDEN)
        
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def mark_contents_viewed(self, request, pk=None):
        """
        Mark all accessible files in the folder AND SUBFOLDERS as viewed
        """
        folder = self.get_object()
        user = request.user
        
        # Helper to get all descendant folders
        def get_all_descendants(parent_folder):
            descendants = []
            children = parent_folder.subfolders.all()
            for child in children:
                descendants.append(child)
                descendants.extend(get_all_descendants(child))
            return descendants

        # Collect all relevant folders (current + descendants)
        all_folders = [folder] + get_all_descendants(folder)
        
        # Determine which files the user can access/view across all these folders
        from django.db.models import Q
        files = FileTransfer.objects.filter(
            folder__in=all_folders,
            is_viewed=False
        ).filter(
            Q(owner=user) | 
            Q(uploader=user) | 
            Q(access_list__granted_to=user) |
            Q(folder__access_list__granted_to=user)
        ).distinct()
        
        updated_count = files.update(is_viewed=True)
        return Response({'status': 'marked as viewed recursively', 'count': updated_count})

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Download folder as ZIP file with all contents recursively using StreamingHttpResponse
        to avoid timeouts and high memory usage.
        """
        import zipfile
        import io
        
        folder = self.get_object()

        if not self._has_folder_access(request.user, folder):
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)
        
        # 1. Collect all files to be zipped first (Main Thread - DB Access)
        files_to_zip = [] # List of tuples (file_path, archive_name)
        
        def collect_files(current_folder, path_prefix=""):
            # Collect files
            files = FileTransfer.objects.filter(
                folder=current_folder
            ).filter(
                Q(owner=request.user)
                | Q(access_list__granted_to=request.user)
                | Q(folder__access_list__granted_to=request.user)
            ).distinct()
            
            for file_transfer in files:
                if file_transfer.file and hasattr(file_transfer.file, 'path'):
                    try:
                        # Check existence simply by access
                        if os.path.exists(file_transfer.file.path):
                            archive_path = os.path.join(path_prefix, file_transfer.filename)
                            files_to_zip.append((file_transfer.file.path, archive_path))
                    except Exception:
                        pass

            # Collect subfolders
            subfolders = Folder.objects.filter(parent=current_folder).filter(
                Q(owner=request.user)
                | Q(access_list__granted_to=request.user)
            ).distinct()
            
            for subfolder in subfolders:
                subfolder_path = os.path.join(path_prefix, subfolder.name)
                collect_files(subfolder, subfolder_path)

        # Build the file list
        collect_files(folder, folder.name)
        
        # Calculate approximate total size (uncompressed) for progress bar
        total_size = sum(os.path.getsize(f[0]) for f in files_to_zip if os.path.exists(f[0]))

        # 2. Setup Pipe and Thread for Streaming
        r, w = os.pipe()
        
        def zip_writer(write_fd, file_list):
            """Thread function to write zip to pipe"""
            try:
                with os.fdopen(write_fd, 'wb') as w_file:
                    with zipfile.ZipFile(w_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                        for file_path, archive_name in file_list:
                            try:
                                zf.write(file_path, archive_name)
                            except Exception as e:
                                print(f"Error zipping {file_path}: {e}")
            except Exception as e:
                print(f"Zip writer thread error: {e}")
            # File descriptor is closed by with context or explicitly
        
        # Start background thread
        t = threading.Thread(target=zip_writer, args=(w, files_to_zip))
        t.daemon = True
        t.start()
        
        # 3. Stream Generator
        def file_iterator(read_fd):
            with os.fdopen(read_fd, 'rb') as r_file:
                while True:
                    data = r_file.read(65536) # 64KB chunks
                    if not data:
                        break
                    yield data
            # Ensure thread finishes
            t.join(timeout=1.0)

        response = StreamingHttpResponse(file_iterator(r), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{folder.name}.zip"'
        # Custom header for progress estimation (Approximation: Uncompressed size)
        response['X-Total-Size'] = str(total_size)
        return response

    def _has_folder_access(self, user, folder: Folder) -> bool:
        if folder.owner_id == user.id:
            return True
        return folder.access_list.filter(granted_to=user).exists()

    @action(detail=True, methods=['delete'])
    def delete_folder(self, request, pk=None):
        """Delete folder and all its contents recursively"""
        folder = self.get_object()
        
        # Check if user has edit permission
        permission = self._get_folder_permission(request.user, folder)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para eliminar esta carpeta'
            }, status=status.HTTP_403_FORBIDDEN)
        
        try:
            # Delete all files in this folder and subfolders recursively
            self._delete_folder_contents(folder, request.user)
            
            # Delete the folder itself
            folder.delete()
            
            return Response({'status': 'deleted', 'message': f'Carpeta "{folder.name}" y todo su contenido eliminados correctamente'})
        except Exception as e:
            print(f"Error deleting folder {folder.id}: {e}")
            return Response({'error': 'Error al eliminar la carpeta'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _delete_folder_contents(self, folder, user):
        """Recursively delete all files and subfolders in a folder"""
        # Delete all files in this folder
        files = FileTransfer.objects.filter(
            folder=folder
        ).filter(
            Q(owner=user) | Q(uploader=user)
        )
        
        for file in files:
            if file.file and os.path.exists(file.file.path):
                file.file.delete()  # Delete physical file
            file.delete()  # Delete database record
        
        # Recursively delete subfolders
        subfolders = Folder.objects.filter(parent=folder, owner=user)
        for subfolder in subfolders:
            self._delete_folder_contents(subfolder, user)  # Recursive call
            subfolder.delete()  # Delete the subfolder

    @action(detail=True, methods=['get', 'post'], url_path='access')
    def manage_access(self, request, pk=None):
        folder = self.get_object()
        
        # Check if user has edit permission to manage access
        permission = self._get_folder_permission(request.user, folder)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para gestionar el acceso a esta carpeta'
            }, status=status.HTTP_403_FORBIDDEN)

        if request.method.lower() == 'get':
            serializer = FolderAccessSerializer(folder.access_list.all(), many=True)
            return Response(serializer.data)

        # POST method - grant access
        username = request.data.get('username')
        permission = request.data.get('permission', FolderAccess.Permission.READ)
        propagate_value = request.data.get('propagate', True)
        if isinstance(propagate_value, str):
            propagate = propagate_value.lower() in {'1', 'true', 'yes', 'on'}
        else:
            propagate = bool(propagate_value)

        if not username:
            return Response({'error': 'Username required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        # Prevent removing original owner
        if user.id == folder.owner_id:
            return Response({
                'error': 'cannot_remove_original',
                'message': 'No puedes eliminar al usuario original de esta carpeta'
            }, status=status.HTTP_400_BAD_REQUEST)

        access, _created = FolderAccess.objects.update_or_create(
            folder=folder,
            granted_to=user,
            defaults={
                'granted_by': request.user,
                'permission': permission,
                'propagate': propagate,
                'expires_at': request.data.get('expires_at')
            }
        )

        # Si se debe propagar el acceso, aplicarlo a todos los elementos internos
        if propagate:
            self._propagate_access_to_contents(folder, user, request.user, permission, request.data.get('expires_at'))

        serializer = FolderAccessSerializer(access)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='access/(?P<user_id>[^/.]+)')
    def revoke_access(self, request, pk=None, user_id=None):
        folder = self.get_object()
        
        # Check if user has edit permission to manage access
        permission = self._get_folder_permission(request.user, folder)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para gestionar el acceso a esta carpeta'
            }, status=status.HTTP_403_FORBIDDEN)

        try:
            access = folder.access_list.get(granted_to_id=user_id)
            
            # Prevent removing original owner
            if user_id == folder.owner_id:
                return Response({
                    'error': 'cannot_remove_original',
                    'message': 'No puedes eliminar al usuario original de esta carpeta'
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except FolderAccess.DoesNotExist:
            return Response({'error': 'Access not found'}, status=status.HTTP_404_NOT_FOUND)

        access.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _propagate_access_to_contents(self, folder, user, granted_by, permission, expires_at):
        """
        Propaga el acceso de una carpeta a todos sus contenidos (archivos y subcarpetas)
        """
        from django.db.models import Q
        
        # Propagar a subcarpetas
        subfolders = Folder.objects.filter(parent=folder)
        for subfolder in subfolders:
            FolderAccess.objects.update_or_create(
                folder=subfolder,
                granted_to=user,
                defaults={
                    'granted_by': granted_by,
                    'permission': permission,
                    'expires_at': expires_at
                }
            )
            # Recursividad para subcarpetas anidadas
            self._propagate_access_to_contents(subfolder, user, granted_by, permission, expires_at)
        
        # Propagar a archivos
        files = FileTransfer.objects.filter(folder=folder)
        for file in files:
            FileAccess.objects.update_or_create(
                file=file,
                granted_to=user,
                defaults={
                    'granted_by': granted_by,
                    'permission': permission,
                    'expires_at': expires_at
                }
            )

    def _inherit_folder_access(self, new_folder, parent_folder):
        """
        Hereda los accesos de la carpeta padre a la nueva carpeta
        """
        parent_accesses = FolderAccess.objects.filter(folder=parent_folder)
        
        for access in parent_accesses:
            FolderAccess.objects.update_or_create(
                folder=new_folder,
                granted_to=access.granted_to,
                defaults={
                    'granted_by': access.granted_by,
                    'permission': access.permission,
                    'expires_at': access.expires_at
                }
            )

    def _inherit_file_access(self, new_file, parent_folder):
        """
        Hereda los accesos de la carpeta padre al nuevo archivo
        """
        folder_accesses = FolderAccess.objects.filter(folder=parent_folder)
        
        for access in folder_accesses:
            FileAccess.objects.update_or_create(
                file=new_file,
                granted_to=access.granted_to,
                defaults={
                    'granted_by': access.granted_by,
                    'permission': access.permission,
                    'expires_at': access.expires_at
                }
            )

class FileTransferViewSet(viewsets.ModelViewSet):
    serializer_class = FileTransferSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    pagination_class = None  # Deshabilitar paginación para mostrar todos los archivos

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return FileTransfer.objects.none()

        return FileTransfer.objects.filter(
            Q(owner=user)
            | Q(uploader=user)
            | Q(access_list__granted_to=user)
            | Q(folder__access_list__granted_to=user)
        ).prefetch_related('access_list').order_by('-created_at').distinct()

    def update(self, request, *args, **kwargs):
        """Override update to check permissions for renaming files"""
        instance = self.get_object()
        
        # Check if user has edit permission
        permission = self._get_file_permission(request.user, instance)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para renombrar este archivo'
            }, status=status.HTTP_403_FORBIDDEN)
        
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """Override partial_update to check permissions for renaming files"""
        instance = self.get_object()
        
        # Check if user has edit permission
        permission = self._get_file_permission(request.user, instance)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para renombrar este archivo'
            }, status=status.HTTP_403_FORBIDDEN)
        
        return super().partial_update(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        user = request.user
        scope = request.query_params.get('scope', 'all')

        if scope == 'shared':
            queryset = queryset.filter(
                Q(access_list__granted_to=user)
                | Q(folder__access_list__granted_to=user)
            )
        elif scope == 'sent':
            # Archivos que otros usuarios han enviado al usuario actual
            queryset = queryset.filter(uploader__in=User.objects.exclude(id=user.id), owner=user)
        else:
            # Mi unidad: mostrar todos los archivos relacionados con el usuario
            # (propios, compartidos con él, y enviados a él)
            # El get_queryset() ya filtra por owner, uploader, y accesos
            pass

        folder_id = request.query_params.get('folder')
        if folder_id == 'null':
            queryset = queryset.filter(folder__isnull=True)
        elif folder_id:
            queryset = queryset.filter(folder_id=folder_id)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def check_rate_limit(self, user, file_size):
        """
        Custom rate limiting based on file size
        """
        cache_key = f'upload_limit_{user.id}'
        last_upload = cache.get(cache_key)
        
        large_threshold = SECURITY_CONFIG['rate_limiting']['large_file_threshold_gb'] * 1024 * 1024 * 1024
        large_cooldown = SECURITY_CONFIG['rate_limiting']['large_file_cooldown_seconds']
        normal_cooldown = SECURITY_CONFIG['rate_limiting']['normal_file_cooldown_seconds']
        
        if last_upload:
            time_diff = (timezone.now() - last_upload).total_seconds()
            
            # Check if file is large
            if file_size > large_threshold:
                if time_diff < large_cooldown:
                    wait_time = int(large_cooldown - time_diff)
                    raise serializers.ValidationError({
                        'file': f'Debes esperar {wait_time} segundos antes de subir otro archivo grande'
                    })
            else:
                if time_diff < normal_cooldown:
                    wait_time = int(normal_cooldown - time_diff)
                    raise serializers.ValidationError({
                        'file': f'Debes esperar {wait_time} segundos antes de subir otro archivo'
                    })
        
        # Update cache with current time
        cache.set(cache_key, timezone.now(), large_cooldown)

    def perform_create(self, serializer):
        """
        Set the sender to the current user and expires_at to 3 days from now
        Handle inheritance of ownership and access for files in shared folders
        """
        from .permissions import has_fileshare_permission
        
        # Check permissions (Staff, Superuser, or fileshareGROUP)
        if not has_fileshare_permission(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('No tienes permisos para subir archivos. Contacta al administrador.')
        
        # Get file size from request
        file_obj = self.request.FILES.get('file')
        if file_obj:
            # Check rate limit before saving
            self.check_rate_limit(self.request.user, file_obj.size)
        
        # Determine ownership based on parent folder
        folder = serializer.validated_data.get('folder')
        received_owner = serializer.validated_data.get('owner')
        
        if received_owner:
            # Use owner sent from frontend
            owner = User.objects.get(id=received_owner.id)
            uploader = self.request.user
        elif folder:
            # If uploading to a shared folder, use the folder's owner
            owner = folder.owner
            uploader = self.request.user
        else:
            # If uploading to root, uploader is both owner and uploader
            owner = self.request.user
            uploader = self.request.user
        
        # Save the file with proper ownership
        instance = serializer.save(
            owner=owner,
            uploader=uploader,
            expires_at=timezone.now() + timedelta(days=3)
        )
        
        # If uploaded to a shared folder, inherit access
        if folder:
            self._inherit_file_access(instance, folder)
        
        # Scan file for malware
        if file_obj and hasattr(instance.file, 'path'):
            is_safe, message = scan_file_for_malware(instance.file.path)
            if not is_safe:
                # Delete the file and instance
                instance.file.delete()
                instance.delete()
                raise serializers.ValidationError({
                    'file': f'El archivo fue detectado como malware: {message}'
                })
            
            # Scan archive contents for executables
            ext = os.path.splitext(instance.filename)[1].lower()
            if ext in ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']:
                has_executables, executable_list = scan_archive_contents(instance.file.path)
                if has_executables:
                    # Store this information in the instance (you might want to add fields to the model)
                    # For now, we'll just log it
                    print(f"Archive contains executables: {executable_list}")
            
            # Generate thumbnail for image files
            if is_image_file(instance.filename):
                thumbnail_content = generate_thumbnail(instance.file.path)
                if thumbnail_content:
                    thumb_filename = get_thumbnail_filename(instance.filename)
                    instance.thumbnail.save(thumb_filename, thumbnail_content, save=True)
            
            # Generate thumbnail for video files
            elif is_video_file(instance.filename):
                thumbnail_content = generate_video_thumbnail(instance.file.path)
                if thumbnail_content:
                    thumb_filename = get_thumbnail_filename(instance.filename)
                    instance.thumbnail.save(thumb_filename, thumbnail_content, save=True)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Download the file
        """
        instance = self.get_object()
        
        if not self._has_file_access(request.user, instance):
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        if request.user == instance.owner:
            instance.is_downloaded = True
            instance.save(update_fields=['is_downloaded'])
            
        response = FileResponse(instance.file.open(), as_attachment=True, filename=instance.filename)
        return response

    @action(detail=True, methods=['get'])
    def thumbnail(self, request, pk=None):
        """
        Serve the thumbnail image for gallery preview.
        Falls back to a placeholder if no thumbnail exists.
        """
        instance = self.get_object()
        
        if not self._has_file_access(request.user, instance):
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)
        
        # Return thumbnail if it exists
        if instance.thumbnail:
            response = FileResponse(
                instance.thumbnail.open(),
                content_type='image/jpeg'
            )
            response['Cache-Control'] = 'public, max-age=86400'  # Cache for 24 hours
            return response
        
        # If no thumbnail but it's an image, try to generate one on-the-fly
        # If no thumbnail but it's an image or video, try to generate one on-the-fly
        if instance.file and hasattr(instance.file, 'path'):
            try:
                thumbnail_content = None
                
                if is_image_file(instance.filename):
                    thumbnail_content = generate_thumbnail(instance.file.path)
                elif is_video_file(instance.filename):
                    thumbnail_content = generate_video_thumbnail(instance.file.path)
                
                if thumbnail_content:
                    thumb_filename = get_thumbnail_filename(instance.filename)
                    instance.thumbnail.save(thumb_filename, thumbnail_content, save=True)
                    instance.refresh_from_db()
                    
                    response = FileResponse(
                        instance.thumbnail.open(),
                        content_type='image/jpeg'
                    )
                    response['Cache-Control'] = 'public, max-age=86400'
                    return response
            except Exception as e:
                print(f"Error generating thumbnail on-the-fly for {instance.id}: {e}")
        
        # No thumbnail available
        return Response({'error': 'no_thumbnail'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'])
    def check_archive(self, request, pk=None):
        """
        Check if archive contains executables
        """
        instance = self.get_object()
        ext = os.path.splitext(instance.filename)[1].lower()
        
        if ext not in ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']:
            return Response({
                'is_archive': False,
                'has_executables': False,
                'executable_files': []
            })
        
        if hasattr(instance.file, 'path'):
            has_executables, executable_list = scan_archive_contents(instance.file.path)
            return Response({
                'is_archive': True,
                'has_executables': has_executables,
                'executable_files': executable_list
            })
        
        return Response({
            'is_archive': True,
            'has_executables': False,
            'executable_files': []
        })

    @action(detail=True, methods=['post'])
    def mark_viewed(self, request, pk=None):
        instance = self.get_object()
        if not self._has_file_access(request.user, instance):
            return Response({'status': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        if request.user == instance.owner:
            instance.is_viewed = True
            instance.save(update_fields=['is_viewed'])
        return Response({'status': 'marked as viewed'})

    @action(detail=True, methods=['delete'])
    def delete_file(self, request, pk=None):
        instance = self.get_object()
        
        # Check if user has edit permission
        permission = self._get_file_permission(request.user, instance)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para eliminar este archivo'
            }, status=status.HTTP_403_FORBIDDEN)

        if instance.file:
            instance.file.delete()
        instance.delete()
        return Response({'status': 'deleted'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        instance = self.get_object()
        folder_id = request.data.get('folder_id')
        
        # Check if user has edit permission
        permission = self._get_file_permission(request.user, instance)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para mover este archivo'
            }, status=status.HTTP_403_FORBIDDEN)
             
        if folder_id:
            try:
                folder = Folder.objects.get(id=folder_id, owner=request.user)
                instance.folder = folder
            except Folder.DoesNotExist:
                return Response({'error': 'Folder not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            instance.folder = None
            
        instance.save()
        return Response({'status': 'moved'})

    @action(detail=False, methods=['post'], url_path='download_multiple')
    def download_multiple(self, request):
        """Download multiple files and folders as a ZIP"""
        print("DOWNLOAD_MULTIPLE METHOD CALLED!")
        
        # Debug: log received data
        print(f"DEBUG: request.data = {request.data}")
        print(f"DEBUG: request.FILES = {request.FILES}")
        
        file_ids = request.data.getlist('file_ids[]', [])
        folder_ids = request.data.getlist('folder_ids[]', [])
        
        print(f"DEBUG: file_ids = {file_ids}")
        print(f"DEBUG: folder_ids = {folder_ids}")
        
        if not file_ids and not folder_ids:
            return Response({'error': 'No files or folders specified'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Create a ZIP file in memory
        zip_buffer = BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add files to ZIP
            for file_id in file_ids:
                try:
                    file_transfer = FileTransfer.objects.filter(
                        id=file_id
                    ).filter(
                        Q(owner=request.user) | Q(uploader=request.user) | Q(access_list__granted_to=request.user)
                    ).first()
                    
                    if file_transfer and file_transfer.file and os.path.exists(file_transfer.file.path):
                        # Add file to ZIP with original filename
                        zip_file.write(
                            file_transfer.file.path,
                            os.path.basename(file_transfer.file.name)
                        )
                        print(f"Added file: {file_transfer.file.name}")
                except Exception as e:
                    print(f"Error adding file {file_id}: {e}")
                    continue  # Skip files user doesn't have access to
            
            # Add folders to ZIP
            for folder_id in folder_ids:
                try:
                    folder = Folder.objects.filter(
                        id=folder_id
                    ).filter(
                        Q(owner=request.user) | Q(access_list__granted_to=request.user)
                    ).first()
                    if folder:
                        # Add all files in this folder and subfolders
                        self._add_folder_to_zip(zip_file, folder, request.user, '')
                        print(f"Added folder: {folder.name}")
                    
                except Exception as e:
                    print(f"Error adding folder {folder_id}: {e}")
                    continue  # Skip folders user doesn't have access to
        
        zip_buffer.seek(0)
        
        # Create response with ZIP file
        response = FileResponse(
            zip_buffer,
            as_attachment=True,
            filename=f'archivos_seleccionados_{timezone.now().strftime("%Y%m%d_%H%M%S")}.zip'
        )
        response['Content-Type'] = 'application/zip'
        
        print(f"ZIP created successfully with {len(file_ids)} files and {len(folder_ids)} folders")
        return response
    
    def _add_folder_to_zip(self, zip_file, folder, user, base_path):
        """Recursively add folder contents to ZIP"""
        folder_path = os.path.join(base_path, folder.name) if base_path else folder.name
        
        # Add files in this folder
        files = FileTransfer.objects.filter(
            folder=folder
        ).filter(
            Q(owner=user) | Q(uploader=user) | Q(access_list__granted_to=user)
        )
        
        for file_transfer in files:
            if file_transfer.file and os.path.exists(file_transfer.file.path):
                zip_file.write(
                    file_transfer.file.path,
                    os.path.join(folder_path, os.path.basename(file_transfer.file.name))
                )
        
        # Recursively add subfolders
        subfolders = Folder.objects.filter(
            parent=folder
        ).filter(
            Q(owner=user) | Q(access_list__granted_to=user)
        )
        
        for subfolder in subfolders:
            self._add_folder_to_zip(zip_file, subfolder, user, folder_path)

    def _has_file_access(self, user, instance: FileTransfer) -> bool:
        if user.is_anonymous:
            return False
        if instance.owner_id == user.id or instance.uploader_id == user.id:
            return True
        if instance.access_list.filter(granted_to=user).exists():
            return True
        if instance.folder and instance.folder.access_list.filter(granted_to=user).exists():
            return True
        return False

    def _get_file_permission(self, user, instance: FileTransfer) -> str:
        """Get the permission level for a user on a file"""
        if user.is_anonymous:
            return 'none'
        
        # Owner and uploader have full permissions
        if instance.owner_id == user.id or instance.uploader_id == user.id:
            return 'edit'
        
        # Check direct file access
        file_access = instance.access_list.filter(granted_to=user).first()
        if file_access:
            return file_access.permission
        
        # Check folder access
        if instance.folder:
            folder_access = instance.folder.access_list.filter(granted_to=user).first()
            if folder_access:
                return folder_access.permission
        
        return 'none'

    @action(detail=True, methods=['delete'], url_path='access/(?P<user_id>[^/.]+)')
    def revoke_access(self, request, pk=None, user_id=None):
        instance = self.get_object()
        
        # Check if user has edit permission to manage access
        permission = self._get_file_permission(request.user, instance)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para gestionar el acceso a este archivo'
            }, status=status.HTTP_403_FORBIDDEN)

        try:
            access = instance.access_list.get(granted_to_id=user_id)
            
            # Prevent removing original owner/uploader
            if user_id in [instance.owner_id, instance.uploader_id]:
                return Response({
                    'error': 'cannot_remove_original',
                    'message': 'No puedes eliminar al usuario original que compartió este archivo'
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except FileAccess.DoesNotExist:
            return Response({'error': 'Access not found'}, status=status.HTTP_404_NOT_FOUND)

        access.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get', 'post'], url_path='access')
    def manage_access(self, request, pk=None):
        instance = self.get_object()
        
        # Check if user has edit permission to manage access
        permission = self._get_file_permission(request.user, instance)
        if permission not in ['edit']:
            return Response({
                'error': 'insufficient_permissions',
                'message': 'No tienes permisos para gestionar el acceso a este archivo'
            }, status=status.HTTP_403_FORBIDDEN)

        if request.method.lower() == 'get':
            serializer = FileAccessSerializer(instance.access_list.all(), many=True)
            return Response(serializer.data)

        # POST method - grant access
        username = request.data.get('username')
        permission_level = request.data.get('permission', FileAccess.Permission.READ)
        expires_at = request.data.get('expires_at')

        if not username:
            return Response({'error': 'Username required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        # Prevent removing original owner/uploader
        if user.id in [instance.owner_id, instance.uploader_id]:
            return Response({
                'error': 'cannot_remove_original',
                'message': 'No puedes eliminar al usuario original que compartió este archivo'
            }, status=status.HTTP_400_BAD_REQUEST)

        access, _created = FileAccess.objects.update_or_create(
            file=instance,
            granted_to=user,
            defaults={
                'granted_by': request.user,
                'permission': permission_level,
                'expires_at': expires_at
            }
        )

        serializer = FileAccessSerializer(access)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _inherit_file_access(self, new_file, parent_folder):
        """
        Hereda los accesos de la carpeta padre al nuevo archivo
        """
        folder_accesses = FolderAccess.objects.filter(folder=parent_folder)
        
        for access in folder_accesses:
            FileAccess.objects.update_or_create(
                file=new_file,
                granted_to=access.granted_to,
                defaults={
                    'granted_by': access.granted_by,
                    'permission': access.permission,
                    'expires_at': access.expires_at
                }
            )


class ShareLinkViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar enlaces de compartición.
    
    Endpoints:
    - GET /api/share-links/ - Listar enlaces creados por el usuario
    - POST /api/share-links/ - Crear nuevo enlace
    - DELETE /api/share-links/{id}/ - Revocar enlace
    - GET /api/share-links/{token}/access/ - Acceder al elemento via enlace (público)
    """
    serializer_class = ShareLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Solo devuelve enlaces creados por el usuario actual"""
        return ShareLink.objects.filter(
            created_by=self.request.user,
            is_active=True
        ).select_related('file', 'folder', 'specific_user', 'created_by')

    def perform_destroy(self, instance):
        """Desactivar en lugar de eliminar para mantener historial"""
        instance.is_active = False
        instance.save()

    @action(detail=False, methods=['get'], url_path='for-item')
    def for_item(self, request):
        """
        Obtener enlaces activos para un archivo o carpeta específico.
        Query params: file_id o folder_id
        """
        file_id = request.query_params.get('file_id')
        folder_id = request.query_params.get('folder_id')

        if not file_id and not folder_id:
            return Response(
                {'error': 'Especifica file_id o folder_id'},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset()
        
        if file_id:
            queryset = queryset.filter(file_id=file_id)
        else:
            queryset = queryset.filter(folder_id=folder_id)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='access', permission_classes=[permissions.AllowAny])
    def access(self, request, pk=None):
        """
        Endpoint público para acceder a un elemento via token de enlace.
        El pk aquí es el token, no el id.
        """
        token = pk
        
        try:
            link = ShareLink.objects.select_related(
                'file', 'folder', 'specific_user', 'created_by'
            ).get(token=token, is_active=True)
        except ShareLink.DoesNotExist:
            return Response(
                {'error': 'Enlace no válido o expirado'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Verificar expiración
        if link.expires_at and link.expires_at < timezone.now():
            return Response(
                {'error': 'Enlace expirado'},
                status=status.HTTP_410_GONE
            )

        # Verificar acceso de usuario específico
        if link.access_type == ShareLink.AccessType.SPECIFIC_USER:
            if not request.user.is_authenticated:
                return Response(
                    {'error': 'Debes iniciar sesión para acceder a este enlace'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            if request.user != link.specific_user:
                return Response(
                    {'error': 'No tienes permiso para acceder a este enlace'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # Si el usuario está autenticado y es enlace "anyone", conceder acceso permanente
        if request.user.is_authenticated and link.access_type == ShareLink.AccessType.ANYONE:
            self._grant_permanent_access(link, request.user)

        # Construir respuesta con info del elemento
        response_data = {
            'type': 'file' if link.file else 'folder',
            'permission': link.permission,
            'access_type': link.access_type,
            'is_authenticated': request.user.is_authenticated,
        }

        if link.file:
            response_data['file'] = {
                'id': link.file.id,
                'filename': link.file.filename,
                'size': link.file.size,
                'created_at': link.file.created_at,
                'owner_username': link.file.owner.username,
            }
        else:
            # Include folder info and contents for anonymous browsing
            folder = link.folder
            response_data['folder'] = {
                'id': folder.id,
                'name': folder.name,
                'created_at': folder.created_at,
                'owner_username': folder.owner.username,
            }
            
            # Add folder contents - files with thumbnail info
            files = FileTransfer.objects.filter(folder=folder).values(
                'id', 'filename', 'size', 'created_at', 'file'
            )
            # Convert to list and add thumbnail URL
            files_list = []
            for f in files:
                file_data = dict(f)
                # Generate thumbnail URL for images
                filename = f['filename'].lower()
                is_image = any(filename.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])
                file_data['is_image'] = is_image
                if is_image:
                    file_data['thumbnail_url'] = f"/api/transfers/{f['id']}/thumbnail/"
                files_list.append(file_data)
            response_data['files'] = files_list
            
            # Add subfolders
            subfolders = Folder.objects.filter(parent=folder).values(
                'id', 'name', 'created_at'
            )
            response_data['subfolders'] = list(subfolders)

        return Response(response_data)

    def _grant_permanent_access(self, link, user):
        """
        Concede acceso permanente al usuario cuando accede via enlace 'anyone'.
        """
        if link.file:
            # No conceder acceso si ya es owner/uploader
            if user.id in [link.file.owner_id, link.file.uploader_id]:
                return
            
            FileAccess.objects.update_or_create(
                file=link.file,
                granted_to=user,
                defaults={
                    'granted_by': link.created_by,
                    'permission': link.permission,
                }
            )
        elif link.folder:
            # No conceder acceso si ya es owner
            if user.id == link.folder.owner_id:
                return
            
            FolderAccess.objects.update_or_create(
                folder=link.folder,
                granted_to=user,
                defaults={
                    'granted_by': link.created_by,
                    'permission': link.permission,
                    'propagate': True,
                }
            )

    @action(detail=True, methods=['get'], url_path='thumbnail/(?P<file_id>[^/.]+)', permission_classes=[permissions.AllowAny])
    def thumbnail(self, request, pk=None, file_id=None):
        """
        Endpoint público para obtener thumbnail de archivo via share token.
        URL: /api/share-links/{token}/thumbnail/{file_id}/
        """
        token = pk
        
        try:
            link = ShareLink.objects.select_related('folder').get(
                token=token, is_active=True
            )
        except ShareLink.DoesNotExist:
            return Response({'error': 'Enlace no válido'}, status=status.HTTP_404_NOT_FOUND)
        
        # Verificar que el archivo pertenece a la carpeta compartida
        if not link.folder:
            return Response({'error': 'Este enlace no es para una carpeta'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            file_obj = FileTransfer.objects.get(id=file_id, folder=link.folder)
        except FileTransfer.DoesNotExist:
            return Response({'error': 'Archivo no encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        # Generar thumbnail
        from PIL import Image
        from django.http import HttpResponse, FileResponse
        import io
        import os
        
        file_path = file_obj.file.path
        ext = os.path.splitext(file_obj.filename)[1].lower()
        
        # Imágenes soportadas
        supported_images = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
        
        if ext not in supported_images:
            return Response({'error': 'No es una imagen'}, status=status.HTTP_400_BAD_REQUEST)
        
        # SVG: Servir directamente (no se puede procesar con PIL)
        if ext == '.svg':
            try:
                return FileResponse(open(file_path, 'rb'), content_type='image/svg+xml')
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Otros formatos: Generar thumbnail con PIL
        try:
            img = Image.open(file_path)
            img.thumbnail((300, 300))
            
            output = io.BytesIO()
            format_map = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.gif': 'GIF', '.webp': 'WEBP', '.bmp': 'BMP'}
            img_format = format_map.get(ext, 'JPEG')
            
            if img_format == 'JPEG' and img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            img.save(output, format=img_format, quality=80)
            output.seek(0)
            
            return HttpResponse(output.read(), content_type=f'image/{img_format.lower()}')
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='download/(?P<file_id>[^/.]+)', permission_classes=[permissions.AllowAny])
    def download(self, request, pk=None, file_id=None):
        """
        Endpoint público para descargar archivo via share token.
        URL: /api/share-links/{token}/download/{file_id}/
        """
        token = pk
        
        try:
            link = ShareLink.objects.select_related('folder', 'file').get(
                token=token, is_active=True
            )
        except ShareLink.DoesNotExist:
            return Response({'error': 'Enlace no válido'}, status=status.HTTP_404_NOT_FOUND)
        
        # Determinar el archivo a descargar
        file_obj = None
        
        if link.file and str(link.file.id) == str(file_id):
            # Enlace directo a archivo
            file_obj = link.file
        elif link.folder:
            # Archivo dentro de carpeta compartida
            try:
                file_obj = FileTransfer.objects.get(id=file_id, folder=link.folder)
            except FileTransfer.DoesNotExist:
                return Response({'error': 'Archivo no encontrado en la carpeta compartida'}, status=status.HTTP_404_NOT_FOUND)
        else:
            return Response({'error': 'Archivo no accesible'}, status=status.HTTP_403_FORBIDDEN)
        
        # Servir el archivo
        from django.http import FileResponse
        import os
        
        file_path = file_obj.file.path
        if not os.path.exists(file_path):
            return Response({'error': 'Archivo no encontrado en el servidor'}, status=status.HTTP_404_NOT_FOUND)
        
        response = FileResponse(
            open(file_path, 'rb'),
            as_attachment=True,
            filename=file_obj.filename
        )
        response['Content-Length'] = file_obj.size
        return response
