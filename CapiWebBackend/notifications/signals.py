from django.db.models.signals import post_save
from django.dispatch import receiver
from django.apps import apps
from .models import Notification

@receiver(post_save, sender='transfers.FileTransfer')
def create_file_transfer_notification(sender, instance, created, **kwargs):
    if created:
        # Suppress notification if sending to self
        if instance.sender == instance.recipient:
            return
            
        Notification.objects.create(
            recipient=instance.recipient,
            sender=instance.sender,
            message=f"Has recibido un archivo: {instance.filename}",
            notification_type='file_received'
        )

@receiver(post_save, sender='social.FriendRequest')
def create_friend_request_notification(sender, instance, created, **kwargs):
    if created and instance.status == 'pending':
        Notification.objects.create(
            recipient=instance.to_user,
            sender=instance.from_user,
            message=f"Solicitud de amistad de {instance.from_user.username}",
            notification_type='friend_request'
        )
    elif not created and instance.status == 'accepted':
        Notification.objects.create(
            recipient=instance.from_user,
            sender=instance.to_user,
            message=f"{instance.to_user.username} aceptó tu solicitud de amistad",
            notification_type='friend_request'
        )
