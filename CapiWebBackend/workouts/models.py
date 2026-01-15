from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


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
    goal = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

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
    image = models.ImageField(upload_to="workouts/days/", blank=True, null=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_completed = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "day_of_week"]
        unique_together = ("routine", "day_of_week")

    def __str__(self) -> str:
        return f"{self.routine.title} - {self.get_day_of_week_display()}"


class RoutineExercise(models.Model):
    routine_day = models.ForeignKey(
        RoutineDay, on_delete=models.CASCADE, related_name="routine_exercises"
    )
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="routine_links")
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









