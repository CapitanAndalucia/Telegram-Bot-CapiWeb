from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


def migrate_shared_copies(apps, schema_editor):
    FileTransfer = apps.get_model('transfers', 'FileTransfer')
    FileAccess = apps.get_model('transfers', 'FileAccess')

    db_alias = schema_editor.connection.alias

    copies = FileTransfer.objects.using(db_alias).filter(is_shared_copy=True)
    for copy in copies.select_related('uploader', 'owner', 'folder'):
        original = FileTransfer.objects.using(db_alias).filter(
            uploader_id=copy.uploader_id,
            owner_id=copy.uploader_id,
            filename=copy.filename,
            is_shared_copy=False
        ).exclude(pk=copy.pk).order_by('-created_at').first()

        if original is None:
            original = FileTransfer.objects.using(db_alias).filter(
                uploader_id=copy.uploader_id,
                is_shared_copy=False
            ).exclude(pk=copy.pk).order_by('-created_at').first()

        if original is None:
            # No base file found; skip conversion and leave the copy as canonical
            continue

        access_defaults = {
            'granted_by_id': copy.uploader_id,
            'permission': 'read',
            'expires_at': copy.expires_at,
        }

        FileAccess.objects.using(db_alias).get_or_create(
            file=original,
            granted_to_id=copy.owner_id,
            defaults=access_defaults
        )

        # Clean up duplicate storage and record
        if copy.file:
            copy.file.delete(save=False)
        copy.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('transfers', '0004_filetransfer_is_shared_copy'),
    ]

    operations = [
        migrations.RenameField(
            model_name='filetransfer',
            old_name='sender',
            new_name='uploader',
        ),
        migrations.RenameField(
            model_name='filetransfer',
            old_name='recipient',
            new_name='owner',
        ),
        migrations.AlterField(
            model_name='filetransfer',
            name='owner',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='owned_files', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='filetransfer',
            name='uploader',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='uploaded_files', to=settings.AUTH_USER_MODEL),
        ),
        migrations.CreateModel(
            name='FolderAccess',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('permission', models.CharField(choices=[('read', 'Lectura'), ('edit', 'Edición')], default='read', max_length=10)),
                ('propagate', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('folder', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='access_list', to='transfers.folder')),
                ('granted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='granted_folder_accesses', to=settings.AUTH_USER_MODEL)),
                ('granted_to', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='folder_accesses', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='FileAccess',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('permission', models.CharField(choices=[('read', 'Lectura'), ('edit', 'Edición')], default='read', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('file', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='access_list', to='transfers.filetransfer')),
                ('granted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='granted_file_accesses', to=settings.AUTH_USER_MODEL)),
                ('granted_to', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='file_accesses', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AlterUniqueTogether(
            name='fileaccess',
            unique_together={('file', 'granted_to')},
        ),
        migrations.AlterUniqueTogether(
            name='folderaccess',
            unique_together={('folder', 'granted_to')},
        ),
        migrations.RunPython(migrate_shared_copies, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='filetransfer',
            name='is_shared_copy',
        ),
    ]
