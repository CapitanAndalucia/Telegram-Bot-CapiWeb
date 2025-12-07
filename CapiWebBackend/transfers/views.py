from rest_framework import viewsets, permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
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

class FileTransferViewSet(viewsets.ModelViewSet):
    serializer_class = FileTransferSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        """
        Filter files to show only those received by the current user
        """
        user = self.request.user
        if user.is_authenticated:
            queryset = FileTransfer.objects.filter(recipient=user).order_by('-created_at')
            folder_id = self.request.query_params.get('folder')
            if folder_id == 'null':
                queryset = queryset.filter(folder__isnull=True)
            elif folder_id:
                queryset = queryset.filter(folder_id=folder_id)
            return queryset
        return FileTransfer.objects.none()

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
