from rest_framework import serializers
from .models import FileTransfer, Folder
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

class FolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folder
        fields = ['id', 'name', 'owner', 'parent', 'created_at']
        read_only_fields = ['owner', 'created_at']
        
    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)

class FileTransferSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')
    recipient_username = serializers.CharField(write_only=True)
    recipient_username_display = serializers.ReadOnlyField(source='recipient.username')
    file = serializers.FileField(validators=[validate_file])
    has_executables = serializers.BooleanField(read_only=True, required=False)
    executable_files = serializers.ListField(read_only=True, required=False)
    folder = serializers.PrimaryKeyRelatedField(queryset=Folder.objects.all(), required=False, allow_null=True)

    class Meta:
        model = FileTransfer
        fields = ['id', 'sender', 'sender_username', 'recipient', 'recipient_username', 'recipient_username_display',
                  'file', 'filename', 'size', 'description', 'folder',
                  'created_at', 'expires_at', 'is_downloaded', 'is_viewed', 'is_shared_copy',
                  'has_executables', 'executable_files']
        read_only_fields = ['sender', 'recipient', 'size', 'filename', 'created_at', 'is_downloaded', 'is_shared_copy']

    def create(self, validated_data):
        # Extract recipient_username
        recipient_username = validated_data.pop('recipient_username', None)
        if not recipient_username:
            raise serializers.ValidationError({'recipient_username': 'This field is required.'})
            
        try:
            recipient = User.objects.get(username=recipient_username)
            validated_data['recipient'] = recipient
        except User.DoesNotExist:
            raise serializers.ValidationError({'recipient_username': 'User not found.'})

        # Auto-populate sender from context
        user = self.context['request'].user
        validated_data['sender'] = user

        # If uploading to someone else, clear folder (sender can't pick recipient's folders)
        if recipient != user:
            validated_data['folder'] = None
        # Auto-populate filename and size from file
        file_obj = validated_data.get('file')
        if file_obj:
            validated_data['filename'] = file_obj.name
            validated_data['size'] = file_obj.size
        return super().create(validated_data)
