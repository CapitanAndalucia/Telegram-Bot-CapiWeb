from django.db import models
from django.contrib.auth import get_user_model
from django.utils.text import slugify
import unicodedata
import secrets
import string

User = get_user_model()

# Characters for short_id (URL-safe, no confusing chars like 0/O, 1/l/I)
SHORT_ID_CHARS = string.ascii_letters + string.digits
SHORT_ID_CHARS = SHORT_ID_CHARS.replace('0', '').replace('O', '').replace('l', '').replace('I', '').replace('1', '')


def generate_short_id(length=8):
    """Generate a random URL-safe short ID."""
    return ''.join(secrets.choice(SHORT_ID_CHARS) for _ in range(length))


def generate_slug(text):
    """Generate a slug from text (no uniqueness check, just formatting)."""
    if not text:
        return ''
    normalized = unicodedata.normalize('NFD', text)
    ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
    return slugify(ascii_text) or 'item'


def generate_unique_slug(text, model_class, instance, field_name='slug', scope_field=None, scope_value=None):
    """Generate a unique slug for a model instance (legacy, kept for backward compat)."""
    normalized = unicodedata.normalize('NFD', text)
    ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
    base_slug = slugify(ascii_text)
    
    if not base_slug:
        base_slug = 'item'
    
    slug = base_slug
    counter = 1
    
    while True:
        query = {field_name: slug}
        if scope_field and scope_value:
            query[scope_field] = scope_value
        
        qs = model_class.objects.filter(**query)
        if instance.pk:
            qs = qs.exclude(pk=instance.pk)
        
        if not qs.exists():
            return slug
        
        slug = f"{base_slug}-{counter}"
        counter += 1


class Exercise(models.Model):
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    default_sets = models.PositiveSmallIntegerField(default=3)
    default_reps = models.PositiveSmallIntegerField(default=10)
    default_weight = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class ExerciseMedia(models.Model):
    MEDIA_CHOICES = (
        ("image", "Imagen"),
        ("video", "Video"),
    )
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="media")
    file = models.FileField(upload_to="workouts/media/")
    media_type = models.CharField(max_length=10, choices=MEDIA_CHOICES)
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.exercise.name} - {self.media_type}"


class Routine(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="workout_routines")
    title = models.CharField(max_length=120)
    short_id = models.CharField(max_length=8, unique=True, blank=True)
    slug = models.SlugField(max_length=150, blank=True)
    goal = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        # Generate short_id only once (immutable)
        if not self.short_id:
            self.short_id = self._generate_unique_short_id()
        # Always update slug when title changes
        self.slug = generate_slug(self.title)
        super().save(*args, **kwargs)
    
    def _generate_unique_short_id(self):
        """Generate a unique short_id for this model."""
        for _ in range(100):  # Max attempts
            short_id = generate_short_id()
            if not Routine.objects.filter(short_id=short_id).exists():
                return short_id
        raise ValueError("Could not generate unique short_id")
    
    @property
    def url_slug(self):
        """Combined format for URLs: short_id-slug"""
        return f"{self.short_id}-{self.slug}" if self.slug else self.short_id

    def __str__(self) -> str:
        return self.title


class RoutineDay(models.Model):
    DAY_CHOICES = (
        (0, "Lunes"),
        (1, "Martes"),
        (2, "Miércoles"),
        (3, "Jueves"),
        (4, "Viernes"),
        (5, "Sábado"),
        (6, "Domingo"),
    )

    routine = models.ForeignKey(Routine, on_delete=models.CASCADE, related_name="days")
    day_of_week = models.PositiveSmallIntegerField(choices=DAY_CHOICES)
    title = models.CharField(max_length=60, blank=True)
    short_id = models.CharField(max_length=8, unique=True, blank=True)
    slug = models.SlugField(max_length=100, blank=True)
    image = models.ImageField(upload_to="workouts/days/", blank=True, null=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_completed = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "day_of_week"]
        unique_together = [("routine", "day_of_week")]

    def save(self, *args, **kwargs):
        # Generate short_id only once (immutable)
        if not self.short_id:
            self.short_id = self._generate_unique_short_id()
        # Always update slug from title or day name
        slug_source = self.title if self.title else self.get_day_of_week_display()
        self.slug = generate_slug(slug_source)
        super().save(*args, **kwargs)

    def _generate_unique_short_id(self):
        for _ in range(100):
            short_id = generate_short_id()
            if not RoutineDay.objects.filter(short_id=short_id).exists():
                return short_id
        raise ValueError("Could not generate unique short_id")

    @property
    def url_slug(self):
        """Combined format for URLs: short_id-slug"""
        return f"{self.short_id}-{self.slug}" if self.slug else self.short_id

    def __str__(self) -> str:
        return f"{self.routine.title} - {self.get_day_of_week_display()}"


class RoutineExercise(models.Model):
    routine_day = models.ForeignKey(
        RoutineDay, on_delete=models.CASCADE, related_name="routine_exercises"
    )
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="routine_links")
    short_id = models.CharField(max_length=8, unique=True, blank=True)
    slug = models.SlugField(max_length=150, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    target_sets = models.PositiveSmallIntegerField(default=3)
    target_reps = models.PositiveSmallIntegerField(default=10)
    target_weight = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    rest_seconds = models.PositiveSmallIntegerField(default=90)
    note = models.CharField(max_length=255, blank=True)
    icon = models.CharField(max_length=50, blank=True, default='fitness_center')
    custom_name = models.CharField(max_length=255, blank=True, help_text="Custom name for this exercise in this routine")
    
    # Variant support: link to parent exercise if this is a variant
    variant_of = models.ForeignKey(
        'self', on_delete=models.CASCADE, 
        related_name='variants', 
        null=True, blank=True
    )
    is_active_variant = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def save(self, *args, **kwargs):
        # Generate short_id only once (immutable)
        if not self.short_id:
            self.short_id = self._generate_unique_short_id()
        # Always update slug from custom_name or exercise name
        slug_source = self.custom_name if self.custom_name else self.exercise.name
        self.slug = generate_slug(slug_source)
        super().save(*args, **kwargs)

    def _generate_unique_short_id(self):
        for _ in range(100):
            short_id = generate_short_id()
            if not RoutineExercise.objects.filter(short_id=short_id).exists():
                return short_id
        raise ValueError("Could not generate unique short_id")

    @property
    def url_slug(self):
        """Combined format for URLs: short_id-slug"""
        return f"{self.short_id}-{self.slug}" if self.slug else self.short_id

    def __str__(self) -> str:
        return f"{self.exercise.name} ({self.routine_day})"


class ExerciseSet(models.Model):
    routine_exercise = models.ForeignKey(
        RoutineExercise, on_delete=models.CASCADE, related_name="sets"
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="exercise_sets")
    reps = models.PositiveSmallIntegerField(default=0)
    weight = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    note = models.CharField(max_length=255, blank=True)
    media = models.FileField(upload_to="workouts/sets/", blank=True, null=True)
    performed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-performed_at", "id"]

    def __str__(self) -> str:
        return f"Set {self.reps}x{self.weight}kg - {self.routine_exercise}"





