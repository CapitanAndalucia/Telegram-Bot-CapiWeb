"""
Thumbnail generation utilities for file transfers.
Generates compressed preview images for optimal gallery performance.
"""
import os
from io import BytesIO
from PIL import Image, ImageOps
from django.core.files.base import ContentFile

# Supported image extensions
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'}

# Thumbnail settings
THUMBNAIL_MAX_SIZE = (400, 400)  # Max dimensions
THUMBNAIL_QUALITY = 85  # JPEG quality (1-100)
THUMBNAIL_FORMAT = 'JPEG'  # Output format for thumbnails


def is_image_file(filename: str) -> bool:
    """Check if filename has an image extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in IMAGE_EXTENSIONS


def generate_thumbnail(file_path: str, max_size: tuple = THUMBNAIL_MAX_SIZE) -> ContentFile | None:
    """
    Generate a thumbnail from an image file.
    
    Args:
        file_path: Path to the original image file
        max_size: Maximum dimensions (width, height) for the thumbnail
        
    Returns:
        ContentFile containing the thumbnail, or None if generation fails
    """
    try:
        with Image.open(file_path) as img:
            # Apply EXIF orientation to fix rotated images from mobile phones
            img = ImageOps.exif_transpose(img)
            
            # Convert to RGB if necessary (for JPEG output)
            if img.mode in ('RGBA', 'LA', 'P'):
                # Create white background for transparency
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Handle animated GIFs - use first frame
            if hasattr(img, 'n_frames') and img.n_frames > 1:
                img.seek(0)
            
            # Calculate thumbnail size maintaining aspect ratio
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Save to BytesIO
            thumb_io = BytesIO()
            img.save(thumb_io, format=THUMBNAIL_FORMAT, quality=THUMBNAIL_QUALITY, optimize=True)
            thumb_io.seek(0)
            
            return ContentFile(thumb_io.read())
            
    except Exception as e:
        print(f"Error generating thumbnail for {file_path}: {e}")
        return None


def get_thumbnail_filename(original_filename: str) -> str:
    """Generate thumbnail filename from original filename."""
    name, _ = os.path.splitext(original_filename)
    return f"{name}_thumb.jpg"
