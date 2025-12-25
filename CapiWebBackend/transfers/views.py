from rest_framework import viewsets, permissions, status
from django.contrib.auth.models import User
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework import serializers
from django.http import FileResponse
from django.utils import timezone
from datetime import timedelta
from .models import FileTransfer, Folder
from .serializers import FileTransferSerializer, FolderSerializer
from django.db.models import Q
from django.core.cache import cache
from .security_utils import (
    load_security_config,
    scan_archive_contents,
    scan_file_for_malware
)
import os

# Load security configuration
SECURITY_CONFIG = load_security_config()

class FolderViewSet(viewsets.ModelViewSet):
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        queryset = Folder.objects.filter(owner=self.request.user)
        parent_id = self.request.query_params.get('parent')
        if parent_id == 'null':
            queryset = queryset.filter(parent__isnull=True)
        elif parent_id:
            queryset = queryset.filter(parent_id=parent_id)
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
        
        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        
        def add_folder_to_zip(zipf, current_folder, path_prefix=""):
            """Recursively add folder contents to ZIP"""
            # Add files in current folder
            files = FileTransfer.objects.filter(
                recipient=request.user,
                folder=current_folder
            )
            for file_transfer in files:
                if file_transfer.file and hasattr(file_transfer.file, 'path'):
                    file_path = os.path.join(path_prefix, file_transfer.filename)
                    try:
                        zipf.write(file_transfer.file.path, file_path)
                    except FileNotFoundError:
                        pass  # Skip files that no longer exist on disk
            
            # Add subfolders recursively
            subfolders = Folder.objects.filter(owner=request.user, parent=current_folder)
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

    @action(detail=True, methods=['post'])
    def share(self, request, pk=None):
        folder = self.get_object()
        username = request.data.get('username')
        
        try:
            recipient = User.objects.get(username=username)
        except User.DoesNotExist:
             return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        # Copia recursiva (simplificada)
        def copy_folder(src_folder, new_owner, parent=None):
            new_folder = Folder.objects.create(
                name=src_folder.name,
                owner=new_owner,
                parent=parent
            )
            
            # Copiar subcarpetas
            for child in src_folder.subfolders.all():
                copy_folder(child, new_owner, new_folder)
                
            # Copiar archivos
            files = FileTransfer.objects.filter(recipient=src_folder.owner, folder=src_folder)
            for f in files:
                new_file = FileTransfer(
                    sender=request.user,
                    recipient=new_owner,
                    folder=new_folder,
                    filename=f.filename,
                    size=f.size,
                    expires_at=timezone.now() + timedelta(days=3),
                    is_shared_copy=True
                )
                if f.file:
                    try:
                        # Re-save the file content to create a new physical copy
                        new_file.file.save(f.filename, f.file.open(), save=True)
                    except Exception as e:
                        print(f"Error copying file {f.filename}: {e}")
                    
        copy_folder(folder, recipient)
        return Response({'status': 'shared'})

class FileTransferViewSet(viewsets.ModelViewSet):
    serializer_class = FileTransferSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        """Return all transfers the user can access (sender or recipient)."""
        user = self.request.user
        if not user.is_authenticated:
            return FileTransfer.objects.none()

        return FileTransfer.objects.filter(
            Q(recipient=user) | Q(sender=user)
        ).order_by('-created_at').distinct()

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        user = request.user
        scope = request.query_params.get('scope', 'all')

        if scope == 'shared':
            queryset = queryset.filter(recipient=user, is_shared_copy=True)
        elif scope == 'sent':
            # "Enviados" in this context refers to files sent TO the user by others
            queryset = queryset.filter(recipient=user, is_shared_copy=False).exclude(sender=user)
        else:
            # "Mi unidad" - show all files belonging to the user as recipient
            queryset = queryset.filter(recipient=user)

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
        # Get file size from request
        file_obj = self.request.FILES.get('file')
        if file_obj:
            # Check rate limit before saving
            self.check_rate_limit(self.request.user, file_obj.size)
        
        # Save the file
        instance = serializer.save(
            sender=self.request.user,
            expires_at=timezone.now() + timedelta(days=3)
        )
        
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
        
        # Only mark as downloaded if the requester is the recipient
        if request.user == instance.recipient:
            instance.is_downloaded = True
            instance.save()
            
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
        if request.user == instance.recipient:
            instance.is_viewed = True
            instance.save()
            return Response({'status': 'marked as viewed'})
        return Response({'status': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    @action(detail=True, methods=['delete'])
    def delete_file(self, request, pk=None):
        instance = self.get_object()
        if request.user == instance.recipient or request.user == instance.sender:
            # Delete the physical file
            if instance.file:
                instance.file.delete()
            # Delete the database record
            instance.delete()
            return Response({'status': 'deleted'}, status=status.HTTP_204_NO_CONTENT)
        return Response({'status': 'unauthorized'}, status=status.HTTP_403_FORBIDDEN)

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        instance = self.get_object()
        folder_id = request.data.get('folder_id')
        
        if request.user != instance.recipient:
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

    @action(detail=True, methods=['post'])
    def share(self, request, pk=None):
        instance = self.get_object()
        username = request.data.get('username')
        if not username:
            return Response({'error': 'Username required'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            recipient = User.objects.get(username=username)
        except User.DoesNotExist:
             return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
             
        # Crear copia del registro
        new_transfer = FileTransfer(
            sender=request.user,
            recipient=recipient,
            filename=instance.filename,
            size=instance.size,
            description=instance.description,
            expires_at=timezone.now() + timedelta(days=3),
            is_shared_copy=True
        )
        # Copiar archivo físico
        if instance.file:
            try:
                new_transfer.file.save(instance.filename, instance.file.open(), save=True)
            except Exception as e:
                return Response({'error': f'Error copying file: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        return Response({'status': 'shared'})
