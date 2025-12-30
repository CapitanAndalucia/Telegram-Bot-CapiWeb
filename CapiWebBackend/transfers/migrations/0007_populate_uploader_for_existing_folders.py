from django.db import migrations
from django.db.models import F


def set_uploader_for_existing_folders(apps, schema_editor):
    """
    Establece el uploader de las carpetas existentes al mismo valor que el owner
    """
    Folder = apps.get_model('transfers', 'Folder')
    
    # Para todas las carpetas existentes, establecer uploader = owner
    Folder.objects.filter(uploader__isnull=True).update(uploader=F('owner'))


def reverse_set_uploader_for_existing_folders(apps, schema_editor):
    """
    Revierte el cambio estableciendo uploader a null
    """
    Folder = apps.get_model('transfers', 'Folder')
    Folder.objects.all().update(uploader=None)


class Migration(migrations.Migration):

    dependencies = [
        ('transfers', '0006_add_uploader_to_folder'),
    ]

    operations = [
        migrations.RunPython(
            set_uploader_for_existing_folders,
            reverse_set_uploader_for_existing_folders
        ),
    ]
