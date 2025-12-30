"""
Management command to generate thumbnails for existing images.
Run with: python manage.py generate_thumbnails
"""
from django.core.management.base import BaseCommand
from transfers.models import FileTransfer
from transfers.thumbnail_utils import is_image_file, generate_thumbnail, get_thumbnail_filename


class Command(BaseCommand):
    help = 'Generate thumbnails for existing image files that do not have one'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Regenerate thumbnails even if they already exist',
        )
        parser.add_argument(
            '--limit',
            type=int,
            help='Limit the number of files to process',
        )

    def handle(self, *args, **options):
        force = options.get('force', False)
        limit = options.get('limit')
        
        # Get all files that are images
        queryset = FileTransfer.objects.all()
        
        if not force:
            # Only process files without thumbnails
            from django.db.models import Q
            queryset = queryset.filter(Q(thumbnail='') | Q(thumbnail__isnull=True))
        
        if limit:
            queryset = queryset[:limit]
        
        total = queryset.count()
        processed = 0
        success = 0
        skipped = 0
        errors = 0
        
        self.stdout.write(f'Processing {total} files...')
        
        for file_transfer in queryset.iterator():
            processed += 1
            
            # Check if it's an image
            if not is_image_file(file_transfer.filename):
                skipped += 1
                continue
            
            # Check if file exists
            if not file_transfer.file or not hasattr(file_transfer.file, 'path'):
                skipped += 1
                continue
            
            try:
                import os
                if not os.path.exists(file_transfer.file.path):
                    self.stdout.write(
                        self.style.WARNING(f'  [{processed}/{total}] File not found: {file_transfer.filename}')
                    )
                    skipped += 1
                    continue
                
                # Generate thumbnail
                thumbnail_content = generate_thumbnail(file_transfer.file.path)
                
                if thumbnail_content:
                    thumb_filename = get_thumbnail_filename(file_transfer.filename)
                    file_transfer.thumbnail.save(thumb_filename, thumbnail_content, save=True)
                    success += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'  [{processed}/{total}] Generated: {file_transfer.filename}')
                    )
                else:
                    errors += 1
                    self.stdout.write(
                        self.style.WARNING(f'  [{processed}/{total}] Failed to generate: {file_transfer.filename}')
                    )
                    
            except Exception as e:
                errors += 1
                self.stdout.write(
                    self.style.ERROR(f'  [{processed}/{total}] Error processing {file_transfer.filename}: {e}')
                )
        
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Completed!'))
        self.stdout.write(f'  Total processed: {processed}')
        self.stdout.write(f'  Thumbnails generated: {success}')
        self.stdout.write(f'  Skipped (not images or missing): {skipped}')
        self.stdout.write(f'  Errors: {errors}')
