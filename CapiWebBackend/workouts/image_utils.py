"""
Image optimization utilities for workouts app.
Uses Pillow to resize and compress images before saving.
"""
from io import BytesIO
from PIL import Image
from django.core.files.uploadedfile import InMemoryUploadedFile
import sys


def optimize_image(
    image_file,
    max_width: int = 1200,
    max_height: int = 1200,
    quality: int = 85,
    format: str = "WEBP"
) -> InMemoryUploadedFile:
    """
    Optimize an uploaded image by resizing and compressing.
    
    Args:
        image_file: The uploaded image file
        max_width: Maximum width in pixels
        max_height: Maximum height in pixels
        quality: JPEG/WebP quality (1-100)
        format: Output format (WEBP, JPEG, PNG)
    
    Returns:
        InMemoryUploadedFile: Optimized image file
    """
    # Open the image
    img = Image.open(image_file)
    
    # Convert to RGB if necessary (for WEBP/JPEG compatibility)
    if img.mode in ("RGBA", "P"):
        # Create a white background for transparency
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if len(img.split()) == 4 else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")
    
    # Calculate new dimensions maintaining aspect ratio
    original_width, original_height = img.size
    
    if original_width > max_width or original_height > max_height:
        # Calculate the scaling factor
        width_ratio = max_width / original_width
        height_ratio = max_height / original_height
        ratio = min(width_ratio, height_ratio)
        
        new_width = int(original_width * ratio)
        new_height = int(original_height * ratio)
        
        # Use high-quality downsampling
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Save to buffer
    output = BytesIO()
    
    # Determine file extension and content type
    if format.upper() == "WEBP":
        img.save(output, format="WEBP", quality=quality, optimize=True)
        content_type = "image/webp"
        extension = ".webp"
    elif format.upper() == "JPEG":
        img.save(output, format="JPEG", quality=quality, optimize=True)
        content_type = "image/jpeg"
        extension = ".jpg"
    else:
        img.save(output, format="PNG", optimize=True)
        content_type = "image/png"
        extension = ".png"
    
    output.seek(0)
    
    # Get original filename and change extension
    original_name = getattr(image_file, 'name', 'image')
    if '.' in original_name:
        base_name = original_name.rsplit('.', 1)[0]
    else:
        base_name = original_name
    new_name = f"{base_name}{extension}"
    
    # Create new InMemoryUploadedFile
    return InMemoryUploadedFile(
        file=output,
        field_name=None,
        name=new_name,
        content_type=content_type,
        size=sys.getsizeof(output),
        charset=None
    )


def optimize_exercise_image(image_file) -> InMemoryUploadedFile:
    """Optimize images specifically for exercises (slightly larger)."""
    return optimize_image(
        image_file,
        max_width=1600,
        max_height=1200,
        quality=85,
        format="WEBP"
    )


def optimize_day_image(image_file) -> InMemoryUploadedFile:
    """Optimize images for routine days (cover images)."""
    return optimize_image(
        image_file,
        max_width=1200,
        max_height=800,
        quality=80,
        format="WEBP"
    )
