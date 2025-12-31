from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Exercise",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("default_sets", models.PositiveSmallIntegerField(default=3)),
                ("default_reps", models.PositiveSmallIntegerField(default=10)),
                ("default_weight", models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="Routine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=120)),
                ("goal", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workout_routines", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="RoutineDay",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("day_of_week", models.PositiveSmallIntegerField(choices=[(0, "Lunes"), (1, "Martes"), (2, "Miércoles"), (3, "Jueves"), (4, "Viernes"), (5, "Sábado"), (6, "Domingo")])),
                ("title", models.CharField(blank=True, max_length=60)),
                ("order", models.PositiveSmallIntegerField(default=0)),
                ("is_completed", models.BooleanField(default=False)),
                ("routine", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="days", to="workouts.routine")),
            ],
            options={"ordering": ["order", "day_of_week"], "unique_together": {("routine", "day_of_week")}},
        ),
        migrations.CreateModel(
            name="RoutineExercise",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("order", models.PositiveSmallIntegerField(default=0)),
                ("target_sets", models.PositiveSmallIntegerField(default=3)),
                ("target_reps", models.PositiveSmallIntegerField(default=10)),
                ("target_weight", models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ("rest_seconds", models.PositiveSmallIntegerField(default=90)),
                ("note", models.CharField(blank=True, max_length=255)),
                ("exercise", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="routine_links", to="workouts.exercise")),
                ("routine_day", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="routine_exercises", to="workouts.routineday")),
            ],
            options={"ordering": ["order", "id"]},
        ),
        migrations.CreateModel(
            name="ExerciseMedia",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file", models.FileField(upload_to="workouts/media/")),
                ("media_type", models.CharField(choices=[("image", "Imagen"), ("video", "Video")], max_length=10)),
                ("order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("exercise", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="media", to="workouts.exercise")),
            ],
            options={"ordering": ["order", "id"]},
        ),
        migrations.CreateModel(
            name="ExerciseSet",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reps", models.PositiveSmallIntegerField(default=0)),
                ("weight", models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ("note", models.CharField(blank=True, max_length=255)),
                ("media", models.FileField(blank=True, null=True, upload_to="workouts/sets/")),
                ("performed_at", models.DateTimeField(auto_now_add=True)),
                ("routine_exercise", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sets", to="workouts.routineexercise")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="exercise_sets", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-performed_at", "id"]},
        ),
    ]









