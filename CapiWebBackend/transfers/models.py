from django.db import models
from django.contrib.auth.models import User


def file_upload_path(instance, filename):
    owner = getattr(instance, 'owner', None)
    owner_username = owner.username if owner else 'unknown'
    return f'media_transfer/{owner_username}/{filename}'

class Folder(models.Model):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_folders')
    uploader = models.ForeignKey(User, on_delete=models.CASCADE, related_name='uploaded_folders', null=True, blank=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='subfolders', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['name', 'owner', 'parent']
        indexes = [
            models.Index(fields=['owner', 'parent']),
        ]

    def __str__(self):
        return f"{self.name} ({self.owner})"

class FileTransfer(models.Model):
    uploader = models.ForeignKey(User, on_delete=models.CASCADE, related_name='uploaded_files')
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_files')
    folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.SET_NULL, related_name='files')
    file = models.FileField(upload_to=file_upload_path)
    filename = models.CharField(max_length=255)
    size = models.BigIntegerField(help_text="Size in bytes")
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_downloaded = models.BooleanField(default=False)
    is_viewed = models.BooleanField(default=False, db_index=True)
    thumbnail = models.ImageField(upload_to='thumbnails/', null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['folder', 'is_viewed']),
            models.Index(fields=['owner', 'folder']),
        ]

    def save(self, *args, **kwargs):
        if self.file and not self.size:
            self.size = self.file.size
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.filename} owned by {self.owner}"


class FileAccess(models.Model):
    class Permission(models.TextChoices):
        READ = 'read', 'Lectura'
        EDIT = 'edit', 'Edición'

    file = models.ForeignKey(FileTransfer, on_delete=models.CASCADE, related_name='access_list')
    granted_to = models.ForeignKey(User, on_delete=models.CASCADE, related_name='file_accesses')
    granted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='granted_file_accesses')
    permission = models.CharField(max_length=10, choices=Permission.choices, default=Permission.READ)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('file', 'granted_to')

    def __str__(self):
        return f"Access to {self.file_id} for {self.granted_to} ({self.permission})"


class FolderAccess(models.Model):
    class Permission(models.TextChoices):
        READ = 'read', 'Lectura'
        EDIT = 'edit', 'Edición'

    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name='access_list')
    granted_to = models.ForeignKey(User, on_delete=models.CASCADE, related_name='folder_accesses')
    granted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='granted_folder_accesses')
    permission = models.CharField(max_length=10, choices=Permission.choices, default=Permission.READ)
    propagate = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('folder', 'granted_to')

    def __str__(self):
        return f"Access to folder {self.folder_id} for {self.granted_to} ({self.permission})"


class ShareLink(models.Model):
    """
    Modelo para compartir archivos/carpetas mediante enlaces URL.
    Permite acceso público (cualquiera con el enlace) o restringido a un usuario específico.
    """
    class AccessType(models.TextChoices):
        ANYONE = 'anyone', 'Cualquiera con el enlace'
        SPECIFIC_USER = 'user', 'Usuario específico'

    class Permission(models.TextChoices):
        READ = 'read', 'Lectura'
        EDIT = 'edit', 'Edición'

    # Token único para el enlace (se genera automáticamente)
    token = models.CharField(max_length=64, unique=True, db_index=True)
    
    # Enlace a archivo O carpeta (uno debe ser null)
    file = models.ForeignKey(FileTransfer, null=True, blank=True, on_delete=models.CASCADE, related_name='share_links')
    folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.CASCADE, related_name='share_links')
    
    # Configuración de acceso
    access_type = models.CharField(max_length=10, choices=AccessType.choices, default=AccessType.ANYONE)
    specific_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='specific_share_links')
    permission = models.CharField(max_length=10, choices=Permission.choices, default=Permission.READ)
    
    # Metadatos
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_share_links')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['file', 'is_active']),
            models.Index(fields=['folder', 'is_active']),
        ]

    def save(self, *args, **kwargs):
        if not self.token:
            import secrets
            self.token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        target = self.file.filename if self.file else self.folder.name
        return f"ShareLink({self.token[:8]}...) -> {target}"
