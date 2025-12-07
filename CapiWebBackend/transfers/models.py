from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
import uuid

def file_upload_path(instance, filename):
    return f'media_transfer/{instance.recipient.username}/{filename}'

class Folder(models.Model):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='subfolders')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['name', 'owner', 'parent']

    def __str__(self):
        return f"{self.name} ({self.owner})"

class FileTransfer(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_files')
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_files')
    folder = models.ForeignKey(Folder, null=True, blank=True, on_delete=models.SET_NULL, related_name='files')
    file = models.FileField(upload_to=file_upload_path)
    filename = models.CharField(max_length=255)
    size = models.BigIntegerField(help_text="Size in bytes")
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_downloaded = models.BooleanField(default=False)
    is_viewed = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if self.file and not self.size:
            self.size = self.file.size
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.filename} from {self.sender} to {self.recipient}"
