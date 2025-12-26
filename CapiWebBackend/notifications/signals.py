from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Notification


def _create_notification(*, recipient, sender, message: str) -> None:
    Notification.objects.create(
        recipient=recipient,
        sender=sender,
        message=message,
        notification_type='file_received',
    )


@receiver(post_save, sender='transfers.FileTransfer')
def create_file_transfer_notification(sender, instance, created, **kwargs):
    if not created:
        return

    # Only notify when a file is uploaded into someone else's space
    if instance.owner_id == instance.uploader_id:
        return

    uploader = getattr(instance, 'uploader', None)
    owner = getattr(instance, 'owner', None)
    if owner is None:
        return

    sender_username = uploader.username if uploader else "Alguien"
    if instance.folder and instance.folder.owner_id == owner.id:
        message = f"{sender_username} ha subido un archivo a tu carpeta \"{instance.folder.name}\""
    else:
        message = f"{sender_username} ha subido el archivo \"{instance.filename}\" a tu unidad"

    _create_notification(recipient=owner, sender=uploader, message=message)


@receiver(post_save, sender='transfers.FileAccess')
def create_file_access_notification(sender, instance, created, **kwargs):
    if not created:
        return

    granted_to = getattr(instance, 'granted_to', None)
    if granted_to is None:
        return

    file_obj = getattr(instance, 'file', None)
    if file_obj is None:
        return

    granted_by = getattr(instance, 'granted_by', None) or getattr(file_obj, 'owner', None)
    sender_username = granted_by.username if granted_by else "Alguien"

    message = f"{sender_username} te ha concedido acceso al archivo \"{file_obj.filename}\""
    _create_notification(recipient=granted_to, sender=granted_by, message=message)


@receiver(post_save, sender='transfers.FolderAccess')
def create_folder_access_notification(sender, instance, created, **kwargs):
    if not created:
        return

    granted_to = getattr(instance, 'granted_to', None)
    folder = getattr(instance, 'folder', None)
    if granted_to is None or folder is None:
        return

    granted_by = getattr(instance, 'granted_by', None) or getattr(folder, 'owner', None)
    sender_username = granted_by.username if granted_by else "Alguien"

    message = f"{sender_username} te ha concedido acceso a la carpeta \"{folder.name}\""
    _create_notification(recipient=granted_to, sender=granted_by, message=message)

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
