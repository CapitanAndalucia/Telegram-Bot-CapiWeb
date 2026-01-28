from rest_framework import serializers
from .models import (
    Exercise, ExerciseMedia, Routine, RoutineDay, RoutineExercise, ExerciseSet,
    MotivationalImage, UserMotivationHistory
)


class ExerciseMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseMedia
        fields = ["id", "media_type", "file", "file_url", "order"]

    file_url = serializers.SerializerMethodField()

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class ExerciseSerializer(serializers.ModelSerializer):
    media = ExerciseMediaSerializer(many=True, read_only=True)

    class Meta:
        model = Exercise
        fields = [
            "id",
            "name",
            "description",
            "default_sets",
            "default_reps",
            "default_weight",
            "icon",
            "media",
        ]
        extra_kwargs = {
            # routine_day not required for nested creation (set in parent serializer's create())
            # but writable for direct creation via POST /routine-exercises/
            'routine_day': {'required': False}
        }


class RoutineExerciseVariantSerializer(serializers.ModelSerializer):
    """Lightweight serializer for variant exercises"""
    exercise_detail = ExerciseSerializer(source="exercise", read_only=True)
    url_slug = serializers.CharField(read_only=True)

    class Meta:
        model = RoutineExercise
        fields = [
            "id",
            "short_id",
            "slug",
            "url_slug",
            "exercise",
            "exercise_detail",
            "target_sets",
            "target_reps",
            "target_weight",
            "is_active_variant",
            "icon",
            "custom_name",
        ]
        extra_kwargs = {
            # routine_day not required for nested creation (set in parent serializer's create())
            # but writable for direct creation via POST /routine-exercises/
            'routine_day': {'required': False}
        }


class RoutineExerciseSerializer(serializers.ModelSerializer):
    exercise_detail = ExerciseSerializer(source="exercise", read_only=True)
    variants = RoutineExerciseVariantSerializer(many=True, read_only=True)
    url_slug = serializers.CharField(read_only=True)

    class Meta:
        model = RoutineExercise
        fields = [
            "id",
            "short_id",
            "slug",
            "url_slug",
            "routine_day",
            "exercise",
            "exercise_detail",
            "order",
            "target_sets",
            "target_reps",
            "target_weight",
            "rest_seconds",
            "note",
            "icon",
            "custom_name",
            "variant_of",
            "is_active_variant",
            "variants",
            # Cardio fields
            "is_cardio",
            "target_duration_minutes",
            "target_distance_km",
            "target_resistance",
        ]
        extra_kwargs = {
            # routine_day not required for nested creation (set in parent serializer's create())
            # but writable for direct creation via POST /routine-exercises/
            'routine_day': {'required': False}
        }


class RoutineDaySerializer(serializers.ModelSerializer):
    routine_exercises = RoutineExerciseSerializer(many=True, required=False)
    day_label = serializers.CharField(source="get_day_of_week_display", read_only=True)
    image_url = serializers.SerializerMethodField()
    url_slug = serializers.CharField(read_only=True)

    class Meta:
        model = RoutineDay
        fields = [
            "id",
            "short_id",
            "slug",
            "url_slug",
            "routine",
            "day_of_week",
            "day_label",
            "title",
            "image",
            "image_url",
            "order",
            "is_completed",
            "routine_exercises",
        ]
        extra_kwargs = {
            # routine_day not required for nested creation (set in parent serializer's create())
            # but writable for direct creation via POST /routine-exercises/
            'routine_day': {'required': False}
        }
        extra_kwargs = {
            'image': {'write_only': True, 'required': False},
            'routine': {'read_only': True}  # Assigned in create(), not from request
        }

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def create(self, validated_data):
        exercises_data = validated_data.pop("routine_exercises", [])
        day = RoutineDay.objects.create(**validated_data)
        for idx, exercise_data in enumerate(exercises_data):
            RoutineExercise.objects.create(
                routine_day=day,
                order=exercise_data.get("order", idx),
                **{k: v for k, v in exercise_data.items() if k != "order"},
            )
        return day


class RoutineSerializer(serializers.ModelSerializer):
    days = RoutineDaySerializer(many=True, required=False)
    url_slug = serializers.CharField(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Routine
        fields = ["id", "short_id", "slug", "url_slug", "title", "goal", "image", "image_url", "created_at", "updated_at", "days"]
        read_only_fields = ["created_at", "updated_at", "slug", "short_id"]
        extra_kwargs = {
            'image': {'write_only': True, 'required': False}
        }

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def create(self, validated_data):
        days_data = validated_data.pop("days", [])
        routine = Routine.objects.create(**validated_data)
        for idx, day_data in enumerate(days_data):
            exercises = day_data.pop("routine_exercises", [])
            day = RoutineDay.objects.create(
                routine=routine,
                order=day_data.get("order", idx),
                **{k: v for k, v in day_data.items() if k != "order"},
            )
            for ex_idx, exercise_data in enumerate(exercises):
                RoutineExercise.objects.create(
                    routine_day=day,
                    order=exercise_data.get("order", ex_idx),
                    **{k: v for k, v in exercise_data.items() if k != "order"},
                )
        return routine

    def update(self, instance, validated_data):
        days_data = validated_data.pop("days", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if days_data is not None:
            instance.days.all().delete()
            for idx, day_data in enumerate(days_data):
                exercises = day_data.pop("routine_exercises", [])
                day = RoutineDay.objects.create(
                    routine=instance,
                    order=day_data.get("order", idx),
                    **{k: v for k, v in day_data.items() if k != "order"},
                )
                for ex_idx, exercise_data in enumerate(exercises):
                    RoutineExercise.objects.create(
                        routine_day=day,
                        order=exercise_data.get("order", ex_idx),
                        **{k: v for k, v in exercise_data.items() if k != "order"},
                    )
        return instance


class ExerciseSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseSet
        fields = [
            "id",
            "routine_exercise",
            "reps",
            "weight",
            "duration_minutes",
            "distance_km",
            "resistance",
            "note",
            "media",
            "performed_at",
        ]
        extra_kwargs = {
            # routine_day not required for nested creation (set in parent serializer's create())
            # but writable for direct creation via POST /routine-exercises/
            'routine_day': {'required': False}
        }
        read_only_fields = ["performed_at"]


class RoutineExerciseDetailSerializer(serializers.ModelSerializer):
    exercise_detail = ExerciseSerializer(source="exercise", read_only=True)
    sets = ExerciseSetSerializer(many=True, read_only=True)
    routine_id = serializers.IntegerField(source="routine_day.routine.id", read_only=True)
    routine_short_id = serializers.CharField(source="routine_day.routine.short_id", read_only=True)
    routine_slug = serializers.CharField(source="routine_day.routine.slug", read_only=True)
    routine_url_slug = serializers.CharField(source="routine_day.routine.url_slug", read_only=True)
    routine_day_id = serializers.IntegerField(source="routine_day.id", read_only=True)
    routine_day_short_id = serializers.CharField(source="routine_day.short_id", read_only=True)
    routine_day_slug = serializers.CharField(source="routine_day.slug", read_only=True)
    routine_day_url_slug = serializers.CharField(source="routine_day.url_slug", read_only=True)
    day_label = serializers.CharField(source="routine_day.get_day_of_week_display", read_only=True)
    variants = RoutineExerciseVariantSerializer(many=True, read_only=True)
    url_slug = serializers.CharField(read_only=True)

    class Meta:
        model = RoutineExercise
        fields = [
            "id",
            "short_id",
            "slug",
            "url_slug",
            "routine_id",
            "routine_short_id",
            "routine_slug",
            "routine_url_slug",
            "routine_day_id",
            "routine_day_short_id",
            "routine_day_slug",
            "routine_day_url_slug",
            "day_label",
            "exercise",
            "exercise_detail",
            "order",
            "target_sets",
            "target_reps",
            "target_weight",
            "rest_seconds",
            "note",
            "icon",
            "custom_name",
            "sets",
            "variant_of",
            "is_active_variant",
            "variants",
            # Cardio fields
            "is_cardio",
            "target_duration_minutes",
            "target_distance_km",
            "target_resistance",
        ]
        extra_kwargs = {
            # routine_day not required for nested creation (set in parent serializer's create())
            # but writable for direct creation via POST /routine-exercises/
            'routine_day': {'required': False}
        }

class MotivationalImageSerializer(serializers.ModelSerializer):
    """Serializer for motivational images with full details"""
    group_display = serializers.CharField(source='get_group_display', read_only=True)
    
    class Meta:
        model = MotivationalImage
        fields = [
            'id',
            'image',
            'description',
            'group',
            'group_display',
            'created_at',
            'updated_at',
            'is_active',
            'order',
        ]
        extra_kwargs = {
            # routine_day not required for nested creation (set in parent serializer's create())
            # but writable for direct creation via POST /routine-exercises/
            'routine_day': {'required': False}
        }
        read_only_fields = ['created_at', 'updated_at']


class MotivationalImageListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views"""
    group_display = serializers.CharField(source='get_group_display', read_only=True)
    
    class Meta:
        model = MotivationalImage
        fields = [
            'id',
            'image',
            'description',
            'group',
            'group_display',
            'created_at',
            'is_active',
            'order',
        ]
        extra_kwargs = {
            # routine_day not required for nested creation (set in parent serializer's create())
            # but writable for direct creation via POST /routine-exercises/
            'routine_day': {'required': False}
        }





