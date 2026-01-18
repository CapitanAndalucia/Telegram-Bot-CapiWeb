from django.contrib import admin
from .models import (
    Exercise, ExerciseMedia, Routine, RoutineDay, RoutineExercise, ExerciseSet,
    MotivationalImage, UserMotivationHistory
)


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ['name', 'default_sets', 'default_reps', 'default_weight', 'created_at']
    search_fields = ['name', 'description']
    list_filter = ['created_at']


@admin.register(ExerciseMedia)
class ExerciseMediaAdmin(admin.ModelAdmin):
    list_display = ['exercise', 'media_type', 'order', 'created_at']
    list_filter = ['media_type', 'created_at']
    search_fields = ['exercise__name']


@admin.register(Routine)
class RoutineAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'short_id', 'slug', 'created_at']
    search_fields = ['title', 'user__username', 'short_id']
    list_filter = ['created_at']
    readonly_fields = ['short_id', 'created_at', 'updated_at']


@admin.register(RoutineDay)
class RoutineDayAdmin(admin.ModelAdmin):
    list_display = ['title', 'routine', 'day_of_week', 'short_id', 'slug']
    list_filter = ['day_of_week']
    search_fields = ['title', 'routine__title', 'short_id']
    readonly_fields = ['short_id']


@admin.register(RoutineExercise)
class RoutineExerciseAdmin(admin.ModelAdmin):
    list_display = ['exercise', 'routine_day', 'target_sets', 'target_reps', 'target_weight', 'short_id']
    search_fields = ['exercise__name', 'routine_day__title', 'short_id']
    readonly_fields = ['short_id']


@admin.register(ExerciseSet)
class ExerciseSetAdmin(admin.ModelAdmin):
    list_display = ['routine_exercise', 'user', 'reps', 'weight', 'performed_at']
    list_filter = ['performed_at']
    search_fields = ['routine_exercise__exercise__name', 'user__username']


@admin.register(MotivationalImage)
class MotivationalImageAdmin(admin.ModelAdmin):
    list_display = ['id', 'get_group_display', 'description_preview', 'is_active', 'order', 'created_at']
    list_filter = ['group', 'is_active', 'created_at']
    search_fields = ['description']
    list_editable = ['is_active', 'order']
    ordering = ['group', 'order', '-created_at']
    
    def description_preview(self, obj):
        return obj.description[:50] + '...' if len(obj.description) > 50 else obj.description
    description_preview.short_description = 'Descripción'
    
    fieldsets = (
        ('Información Básica', {
            'fields': ('image', 'description', 'group')
        }),
        ('Configuración', {
            'fields': ('is_active', 'order')
        }),
        ('Metadatos', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    readonly_fields = ['created_at', 'updated_at']


@admin.register(UserMotivationHistory)
class UserMotivationHistoryAdmin(admin.ModelAdmin):
    list_display = ['user', 'group', 'last_image_shown', 'cycle_count', 'last_shown_at']
    list_filter = ['group', 'last_shown_at']
    search_fields = ['user__username']
    readonly_fields = ['last_shown_at']
    
    def has_add_permission(self, request):
        # Prevent manual creation (should be auto-created)
        return False
