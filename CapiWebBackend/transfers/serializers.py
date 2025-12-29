from rest_framework import serializers
from .models import FileTransfer, Folder, FileAccess, FolderAccess
from django.contrib.auth.models import User
import os
import re
from .security_utils import (
    load_security_config,
    get_all_allowed_extensions,
    get_blocked_extensions
)

# Load security configuration
SECURITY_CONFIG = load_security_config()
ALLOWED_EXTENSIONS = get_all_allowed_extensions()
BLOCKED_EXTENSIONS = get_blocked_extensions()
MAX_FILE_SIZE = SECURITY_CONFIG['file_validation']['max_file_size_gb'] * 1024 * 1024 * 1024

def validate_filename(filename):
    """
    Validate filename against injection attacks while preserving the original name
    """
    # Check for path traversal attempts
    if '..' in filename or '/' in filename or '\\' in filename:
        raise serializers.ValidationError({
            'file': 'Nombre de archivo no permitido: contiene caracteres de navegación de directorios'
        })
    
    # Check for null bytes
    if '\x00' in filename:
        raise serializers.ValidationError({
            'file': 'Nombre de archivo no permitido: contiene caracteres nulos'
        })
    
    # Check for control characters
    if any(ord(char) < 32 for char in filename if char != '\n' and char != '\r' and char != '\t'):
        raise serializers.ValidationError({
            'file': 'Nombre de archivo no permitido: contiene caracteres de control'
        })
    
    # Check for SQL injection patterns
    sql_patterns = [
        r"('|(\\')|(;)|(--)|(\/\*)|(xp_)|(sp_))",
        r"(union.*select)|(insert.*into)|(delete.*from)|(drop.*table)",
    ]
    for pattern in sql_patterns:
        if re.search(pattern, filename, re.IGNORECASE):
            raise serializers.ValidationError({
                'file': 'Nombre de archivo no permitido: contiene patrones sospechosos'
            })
    
    # Check for script injection
    if re.search(r'<script|javascript:|onerror=|onload=', filename, re.IGNORECASE):
        raise serializers.ValidationError({
            'file': 'Nombre de archivo no permitido: contiene código de script'
        })
    
    return filename

def validate_file(value):
    """
    Validate file type and size
    """
    # Get file extension
    ext = os.path.splitext(value.name)[1].lower()
    
    # Check if extension is blocked
    if ext in BLOCKED_EXTENSIONS:
        raise serializers.ValidationError(
            f'Tipo de archivo bloqueado por seguridad: {ext}. '
            f'No se permiten archivos ejecutables.'
        )
    
    # Check if extension is allowed
    if ext not in ALLOWED_EXTENSIONS:
        raise serializers.ValidationError(
            f'Tipo de archivo no permitido: {ext}. '
            f'Tipos permitidos: imágenes, audio, video, archivos comprimidos, documentos.'
        )
    
    # Validate file size
    max_size_gb = SECURITY_CONFIG['file_validation']['max_file_size_gb']
    if value.size > MAX_FILE_SIZE:
        size_gb = value.size / (1024 * 1024 * 1024)
        raise serializers.ValidationError(
            f'El archivo es demasiado grande ({size_gb:.2f} GB). '
            f'Tamaño máximo: {max_size_gb} GB'
        )
    
    # Validate filename
    validate_filename(value.name)
    
    return value

class FolderAccessSerializer(serializers.ModelSerializer):
    granted_to_username = serializers.ReadOnlyField(source='granted_to.username')
    granted_by_username = serializers.ReadOnlyField(source='granted_by.username')

    class Meta:
        model = FolderAccess
        fields = [
            'id', 'folder', 'granted_to', 'granted_to_username', 'granted_by',
            'granted_by_username', 'permission', 'propagate', 'created_at', 'expires_at'
        ]
        read_only_fields = ['folder', 'granted_by', 'created_at']


class FolderSerializer(serializers.ModelSerializer):
    access_list = FolderAccessSerializer(many=True, read_only=True)
    owner_username = serializers.ReadOnlyField(source='owner.username')

    class Meta:
        model = Folder
        fields = ['id', 'name', 'owner', 'owner_username', 'parent', 'created_at', 'access_list']
        read_only_fields = ['owner', 'owner_username', 'created_at', 'access_list']
        
    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)


class FileAccessSerializer(serializers.ModelSerializer):
    granted_to_username = serializers.ReadOnlyField(source='granted_to.username')
    granted_by_username = serializers.ReadOnlyField(source='granted_by.username')

    class Meta:
        model = FileAccess
        fields = [
            'id', 'file', 'granted_to', 'granted_to_username', 'granted_by',
            'granted_by_username', 'permission', 'created_at', 'expires_at'
        ]
        read_only_fields = ['file', 'granted_by', 'created_at']


class FileTransferSerializer(serializers.ModelSerializer):
    uploader_username = serializers.ReadOnlyField(source='uploader.username')
    owner_username = serializers.ReadOnlyField(source='owner.username')
    recipient_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    file = serializers.FileField(validators=[validate_file])
    has_executables = serializers.BooleanField(read_only=True, required=False)
    executable_files = serializers.ListField(read_only=True, required=False)
    folder = serializers.PrimaryKeyRelatedField(queryset=Folder.objects.all(), required=False, allow_null=True)
    access_list = FileAccessSerializer(many=True, read_only=True)
    has_access = serializers.SerializerMethodField()

    class Meta:
        model = FileTransfer
        fields = [
            'id', 'uploader', 'uploader_username', 'owner', 'owner_username', 'recipient_username',
            'file', 'filename', 'size', 'description', 'folder',
            'created_at', 'expires_at', 'is_downloaded', 'is_viewed',
            'has_executables', 'executable_files', 'access_list', 'has_access'
        ]
        read_only_fields = [
            'uploader', 'uploader_username', 'owner', 'owner_username', 'size',
            'filename', 'created_at', 'is_downloaded', 'is_viewed',
            'has_executables', 'executable_files', 'access_list', 'has_access'
        ]

    def get_has_access(self, obj):
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return False
        user = request.user
        if user.is_anonymous:
            return False
        if obj.owner_id == user.id or obj.uploader_id == user.id:
            return True
        if obj.access_list.filter(granted_to=user).exists():
            return True
        if obj.folder and obj.folder.access_list.filter(granted_to=user).exists():
            return True
        return False

    def create(self, validated_data):
        recipient_username = validated_data.pop('recipient_username', None)
        request = self.context['request']
        user = request.user

        if recipient_username:
            try:
                owner = User.objects.get(username=recipient_username)
            except User.DoesNotExist:
                raise serializers.ValidationError({'recipient_username': 'User not found.'})
        else:
            owner = user

        validated_data['owner'] = owner
        validated_data['uploader'] = user

        if owner != user:
            # Uploading to someone else: ensure folder belongs to target user
            validated_data['folder'] = None

        file_obj = validated_data.get('file')
        if file_obj:
            validated_data['filename'] = file_obj.name
            validated_data['size'] = file_obj.size

        return super().create(validated_data)
