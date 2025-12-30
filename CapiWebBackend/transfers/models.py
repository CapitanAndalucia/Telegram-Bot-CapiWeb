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
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='subfolders')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['name', 'owner', 'parent']

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
    is_viewed = models.BooleanField(default=False)
    thumbnail = models.ImageField(upload_to='thumbnails/', null=True, blank=True)

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
