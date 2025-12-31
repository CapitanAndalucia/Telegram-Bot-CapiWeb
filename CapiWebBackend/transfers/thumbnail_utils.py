"""
Thumbnail generation utilities for file transfers.
Generates compressed preview images for optimal gallery performance.
"""
import os
import subprocess
import tempfile
import logging
from io import BytesIO
from PIL import Image, ImageOps
from django.core.files.base import ContentFile

# Configure logger
logger = logging.getLogger('transfers')

# Supported image extensions

# Supported image extensions
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'}

# Supported video extensions
VIDEO_EXTENSIONS = {'.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v', 
                    '.3gp', '.3g2', '.mts', '.m2ts', '.ts', '.mpg', '.mpeg', '.ogv'}

# Thumbnail settings
THUMBNAIL_MAX_SIZE = (400, 400)  # Max dimensions
THUMBNAIL_QUALITY = 85  # JPEG quality (1-100)
THUMBNAIL_FORMAT = 'JPEG'  # Output format for thumbnails


def is_image_file(filename: str) -> bool:
    """Check if filename has an image extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in IMAGE_EXTENSIONS


def is_video_file(filename: str) -> bool:
    """Check if filename has a video extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in VIDEO_EXTENSIONS


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


def generate_video_thumbnail(file_path: str, max_size: tuple = THUMBNAIL_MAX_SIZE) -> ContentFile | None:
    """
    Generate a thumbnail from a video file using ffmpeg.
    Extracts a frame at 1 second into the video.
    """
    logger.warning(f"[THUMBNAIL] Generating video thumbnail for {file_path}")
    temp_image_path = None
    try:
        # Create a temporary file for the extracted frame
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            temp_image_path = tmp.name
        
        # Use ffmpeg to extract a frame at 1 second
        cmd = [
            'ffmpeg',
            '-ss', '1',  # Seek to 1 second
            '-i', file_path,
            '-vframes', '1',
            '-q:v', '2',
            '-y',  # Overwrite output file
            temp_image_path
        ]
        
        logger.warning(f"[THUMBNAIL] Running command: {' '.join(cmd)}")
        
        # Run ffmpeg with timeout
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=30,  # 30 second timeout
            check=False
        )
        
        if result.returncode != 0:
            logger.warning(f"[THUMBNAIL] ffmpeg failed with code {result.returncode}")
            logger.warning(f"[THUMBNAIL] stderr: {result.stderr.decode('utf-8')}")
        
        # Check if the frame was extracted successfully
        if not os.path.exists(temp_image_path) or os.path.getsize(temp_image_path) == 0:
            logger.warning("[THUMBNAIL] First attempt failed, trying at 0 seconds")
            # Try extracting from the beginning if 1 second failed
            cmd[2] = '0'  # Change seek to 0 seconds
            subprocess.run(cmd, capture_output=True, timeout=30, check=False)
        
        # Now use PIL to resize the extracted frame
        if os.path.exists(temp_image_path) and os.path.getsize(temp_image_path) > 0:
            logger.warning(f"[THUMBNAIL] Frame extracted successfully, resizing...")
            with Image.open(temp_image_path) as img:
                # Convert to RGB if necessary
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Resize maintaining aspect ratio
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
                
                # Save to BytesIO
                thumb_io = BytesIO()
                img.save(thumb_io, format=THUMBNAIL_FORMAT, quality=THUMBNAIL_QUALITY, optimize=True)
                thumb_io.seek(0)
                
                logger.warning("[THUMBNAIL] Thumbnail generated successfully")
                return ContentFile(thumb_io.read())
        else:
            logger.warning("[THUMBNAIL] Failed to extract frame (file empty or not created)")
        
        return None
        
    except subprocess.TimeoutExpired:
        logger.warning(f"[THUMBNAIL] Timeout generating video thumbnail for {file_path}")
        return None
    except FileNotFoundError:
        logger.warning("[THUMBNAIL] ffmpeg not found. Please install ffmpeg to generate video thumbnails.")
        return None
    except Exception as e:
        logger.warning(f"[THUMBNAIL] Error generating video thumbnail for {file_path}: {e}")
        return None
    finally:
        # Clean up temporary file
        if temp_image_path and os.path.exists(temp_image_path):
            try:
                os.unlink(temp_image_path)
            except:
                pass


def get_thumbnail_filename(original_filename: str) -> str:
    """Generate thumbnail filename from original filename."""
    name, _ = os.path.splitext(original_filename)
    return f"{name}_thumb.jpg"

