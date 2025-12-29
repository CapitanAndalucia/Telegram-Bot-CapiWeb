from rest_framework import viewsets, permissions, status
from django.contrib.auth.models import User
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework import serializers
from django.http import FileResponse
from django.utils import timezone
from datetime import timedelta
from .models import FileTransfer, Folder, FileAccess, FolderAccess
from .serializers import (
    FileTransferSerializer,
    FolderSerializer,
    FileAccessSerializer,
    FolderAccessSerializer,
)
from django.db.models import Q
from django.core.cache import cache
from .security_utils import (
    load_security_config,
    scan_archive_contents,
    scan_file_for_malware
)
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

    def get_queryset(self):
        user = self.request.user
        queryset = Folder.objects.filter(
            Q(owner=user) | Q(access_list__granted_to=user)
        ).distinct()

        # Apply scope filtering for list views
        if self.action in ['list', None]:  # None for default list action
            scope = self.request.query_params.get('scope', 'mine')
            
            if scope == 'shared':
                queryset = queryset.filter(access_list__granted_to=user).exclude(owner=user)
            elif scope == 'sent':
                # For folders, 'sent' scope doesn't make much sense since folders are owned
                # We'll interpret it as folders owned by user (same as 'mine')
                queryset = queryset.filter(owner=user)
            else:  # 'mine' or default
                queryset = queryset.filter(owner=user)
            
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
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Download folder as ZIP file with all contents recursively
        """
        import zipfile
        import io
        
        folder = self.get_object()

        if not self._has_folder_access(request.user, folder):
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)
        
        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        
        def add_folder_to_zip(zipf, current_folder, path_prefix=""):
            """Recursively add folder contents to ZIP"""
            # Add files in current folder
            files = FileTransfer.objects.filter(
                folder=current_folder
            ).filter(
                Q(owner=request.user)
                | Q(access_list__granted_to=request.user)
                | Q(folder__access_list__granted_to=request.user)
            ).distinct()
            for file_transfer in files:
                if file_transfer.file and hasattr(file_transfer.file, 'path'):
                    file_path = os.path.join(path_prefix, file_transfer.filename)
                    try:
                        zipf.write(file_transfer.file.path, file_path)
                    except FileNotFoundError:
                        pass  # Skip files that no longer exist on disk
            
            # Add subfolders recursively
            subfolders = Folder.objects.filter(parent=current_folder).filter(
                Q(owner=request.user)
                | Q(access_list__granted_to=request.user)
            ).distinct()
            for subfolder in subfolders:
                subfolder_path = os.path.join(path_prefix, subfolder.name)
                add_folder_to_zip(zipf, subfolder, subfolder_path)
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            add_folder_to_zip(zipf, folder, folder.name)
        
        zip_buffer.seek(0)
        
        response = FileResponse(
            zip_buffer,
            as_attachment=True,
            filename=f"{folder.name}.zip"
        )
        response['Content-Type'] = 'application/zip'
        return response

    def _has_folder_access(self, user, folder: Folder) -> bool:
        if folder.owner_id == user.id:
            return True
        return folder.access_list.filter(granted_to=user).exists()

    @action(detail=True, methods=['delete'])
    def delete_folder(self, request, pk=None):
        """Delete folder and all its contents recursively"""
        folder = self.get_object()
        
        if folder.owner != request.user:
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)
        
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
        if folder.owner != request.user:
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        if request.method.lower() == 'get':
            serializer = FolderAccessSerializer(folder.access_list.all(), many=True)
            return Response(serializer.data)

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

        serializer = FolderAccessSerializer(access)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='access/(?P<user_id>[^/.]+)')
    def revoke_access(self, request, pk=None, user_id=None):
        folder = self.get_object()
        if folder.owner != request.user:
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        try:
            access = folder.access_list.get(granted_to_id=user_id)
        except FolderAccess.DoesNotExist:
            return Response({'error': 'Access not found'}, status=status.HTTP_404_NOT_FOUND)

        access.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class FileTransferViewSet(viewsets.ModelViewSet):
    serializer_class = FileTransferSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return FileTransfer.objects.none()

        return FileTransfer.objects.filter(
            Q(owner=user)
            | Q(uploader=user)
            | Q(access_list__granted_to=user)
            | Q(folder__access_list__granted_to=user)
        ).order_by('-created_at').distinct()

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
            queryset = queryset.filter(uploader=user).exclude(owner=user)
        else:
            queryset = queryset.filter(owner=user)

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
        """
        # Sólo usuarios staff pueden subir archivos
        if not getattr(self.request.user, 'is_staff', False):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Solo usuarios staff pueden subir archivos.')
        # Get file size from request
        file_obj = self.request.FILES.get('file')
        if file_obj:
            # Check rate limit before saving
            self.check_rate_limit(self.request.user, file_obj.size)
        
        # Save the file
        instance = serializer.save(expires_at=timezone.now() + timedelta(days=3))
        
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
        if request.user not in {instance.owner, instance.uploader}:
            return Response({'status': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        if instance.file:
            instance.file.delete()
        instance.delete()
        return Response({'status': 'deleted'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        instance = self.get_object()
        folder_id = request.data.get('folder_id')
        
        if request.user != instance.owner:
             return Response({'status': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)
             
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

    @action(detail=True, methods=['get', 'post'], url_path='access')
    def manage_access(self, request, pk=None):
        instance = self.get_object()
        if instance.owner != request.user:
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        if request.method.lower() == 'get':
            serializer = FileAccessSerializer(instance.access_list.all(), many=True)
            return Response(serializer.data)

        # POST method - grant access
        username = request.data.get('username')
        permission = request.data.get('permission', FileAccess.Permission.READ)
        expires_at = request.data.get('expires_at')

        if not username:
            return Response({'error': 'Username required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        access, _created = FileAccess.objects.update_or_create(
            file=instance,
            granted_to=user,
            defaults={
                'granted_by': request.user,
                'permission': permission,
                'expires_at': expires_at
            }
        )

        serializer = FileAccessSerializer(access)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='access/(?P<user_id>[^/.]+)')
    def revoke_access(self, request, pk=None, user_id=None):
        instance = self.get_object()
        if instance.owner != request.user:
            return Response({'error': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        try:
            access = instance.access_list.get(granted_to_id=user_id)
        except FileAccess.DoesNotExist:
            return Response({'error': 'Access not found'}, status=status.HTTP_404_NOT_FOUND)

        access.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
