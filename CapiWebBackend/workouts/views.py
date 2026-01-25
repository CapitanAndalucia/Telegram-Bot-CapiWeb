import logging
import random
from django.db.models import Sum, Avg, Max, Count
from django.db.models.functions import TruncDate
from rest_framework import permissions, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Routine, RoutineDay, RoutineExercise, ExerciseSet, Exercise, ExerciseMedia, MotivationalImage, UserMotivationHistory
from .serializers import (
    RoutineSerializer,
    RoutineExerciseDetailSerializer,
    ExerciseSetSerializer,
    ExerciseSerializer,
    ExerciseMediaSerializer,
    RoutineDaySerializer,
    RoutineExerciseSerializer,
)
from .image_utils import optimize_exercise_image, optimize_day_image

logger = logging.getLogger(__name__)


class IsRoutineOwner(permissions.BasePermission):
    """
    Asegura que el usuario autenticado sea el dueño de la rutina.
    """

    def has_object_permission(self, request, view, obj):
        if isinstance(obj, Routine):
            return obj.user == request.user
        if isinstance(obj, RoutineDay):
            return obj.routine.user == request.user
        if hasattr(obj, "routine_day"):
            return obj.routine_day.routine.user == request.user
        if hasattr(obj, "routine_exercise"):
            return obj.routine_exercise.routine_day.routine.user == request.user
        return False


class RoutineViewSet(viewsets.ModelViewSet):
    serializer_class = RoutineSerializer
    permission_classes = [IsAuthenticated, IsRoutineOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        logger.info(f"RoutineViewSet.get_queryset solicitado por usuario: {user}")
        return Routine.objects.filter(user=user).prefetch_related(
            "days__routine_exercises__exercise__media"
        )

    def get_object(self):
        """Support lookup by ID or short_id (from URL slug like 'f4E7kX-slug-here')."""
        logger.info(f"RoutineViewSet.get_object solicitado. búsqueda: {self.kwargs.get(self.lookup_field)}")
        queryset = self.filter_queryset(self.get_queryset())
        lookup_value = self.kwargs.get(self.lookup_field)
        
        # Try ID first if purely numeric
        if lookup_value.isdigit():
            obj = queryset.filter(pk=int(lookup_value)).first()
        else:
            # Extract short_id from combined format (first 8 chars before hyphen)
            short_id = lookup_value.split('-')[0] if '-' in lookup_value else lookup_value
            obj = queryset.filter(short_id=short_id).first()
        
        if obj is None:
            from rest_framework.exceptions import NotFound
            raise NotFound("Routine not found")
        
        self.check_object_permissions(self.request, obj)
        return obj

    def perform_create(self, serializer):
        logger.info(f"Creando nueva rutina para usuario: {self.request.user}")
        serializer.save(user=self.request.user)


class RoutineDayViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar días de rutina y sus imágenes.
    """
    serializer_class = RoutineDaySerializer
    permission_classes = [IsAuthenticated, IsRoutineOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        logger.info(f"RoutineDayViewSet.get_queryset solicitado por usuario: {user}")
        return RoutineDay.objects.filter(
            routine__user=user
        ).prefetch_related("routine_exercises__exercise__media")

    def get_object(self):
        """Support lookup by ID or short_id (from URL slug like 'f4E7kX-slug-here')."""
        logger.info(f"RoutineDayViewSet.get_object solicitado. búsqueda: {self.kwargs.get(self.lookup_field)}")
        queryset = self.filter_queryset(self.get_queryset())
        lookup_value = self.kwargs.get(self.lookup_field)
        
        if lookup_value.isdigit():
            obj = queryset.filter(pk=int(lookup_value)).first()
        else:
            short_id = lookup_value.split('-')[0] if '-' in lookup_value else lookup_value
            obj = queryset.filter(short_id=short_id).first()
        
        if obj is None:
            from rest_framework.exceptions import NotFound
            raise NotFound("Routine day not found")
        
        self.check_object_permissions(self.request, obj)
        return obj

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsRoutineOwner])
    def upload_image(self, request, pk=None):
        """
        Sube y optimiza una imagen para un día de rutina.
        """
        day = self.get_object()
        logger.info(f"Uploading image for RoutineDay {day.id} ({day.title})")
        
        if 'image' not in request.FILES:
            return Response({'error': 'No se proporcionó imagen'}, status=status.HTTP_400_BAD_REQUEST)
        
        image_file = request.FILES['image']
        
        try:
            # Optimizar la imagen
            optimized_image = optimize_day_image(image_file)
            
            # Eliminar imagen anterior si existe
            if day.image:
                day.image.delete(save=False)
            
            # Guardar nueva imagen
            day.image = optimized_image
            day.save()
            
            serializer = self.get_serializer(day, context={'request': request})
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['delete'], permission_classes=[IsAuthenticated, IsRoutineOwner])
    def delete_image(self, request, pk=None):
        """
        Elimina la imagen de un día de rutina.
        """
        day = self.get_object()
        logger.warning(f"Eliminando imagen para RoutineDay {day.id}")
        
        if day.image:
            day.image.delete(save=False)
            day.image = None
            day.save()
        
        return Response({'message': 'Imagen eliminada'})


class RoutineExerciseViewSet(viewsets.ModelViewSet):
    serializer_class = RoutineExerciseDetailSerializer
    permission_classes = [IsAuthenticated, IsRoutineOwner]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return RoutineExerciseSerializer
        return RoutineExerciseDetailSerializer

    def get_queryset(self):
        user = self.request.user
        logger.info(f"RoutineExerciseViewSet.get_queryset solicitado por usuario: {user}")
        return RoutineExercise.objects.filter(
            routine_day__routine__user=user
        ).prefetch_related("exercise__media", "sets")

    def get_object(self):
        """Support lookup by ID or short_id (from URL slug like 'f4E7kX-slug-here')."""
        logger.info(f"RoutineExerciseViewSet.get_object solicitado. búsqueda: {self.kwargs.get(self.lookup_field)}")
        queryset = self.filter_queryset(self.get_queryset())
        lookup_value = self.kwargs.get(self.lookup_field)
        
        if lookup_value.isdigit():
            obj = queryset.filter(pk=int(lookup_value)).first()
        else:
            short_id = lookup_value.split('-')[0] if '-' in lookup_value else lookup_value
            obj = queryset.filter(short_id=short_id).first()
        
        if obj is None:
            from rest_framework.exceptions import NotFound
            raise NotFound("Exercise not found")
        
        self.check_object_permissions(self.request, obj)
        return obj

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated, IsRoutineOwner])
    def progress(self, request, pk=None):
        """
        Devuelve datos agregados para la gráfica de progreso del ejercicio.
        """
        exercise = self.get_object()
        logger.info(f"RoutineExerciseViewSet.progress solicitado para ejercicio {exercise.id} ({exercise.custom_name or 'unnamed'})")
        sets = ExerciseSet.objects.filter(routine_exercise=exercise, user=request.user)
        points = (
            sets.annotate(day=TruncDate("performed_at"))
            .values("day")
            .annotate(
                total_reps=Sum("reps"),
                max_reps=Max("reps"),
                avg_weight=Avg("weight"),
                max_weight=Max("weight"),
                total_sets=Count("id"),
            )
            .order_by("day")
        )
        return Response(list(points))

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsRoutineOwner])
    def add_variant(self, request, pk=None):
        """
        Crea una variante de ejercicio vinculada al ejercicio actual.
        Expects: { exercise: int, target_sets, target_reps, target_weight }
        """
        parent_exercise = self.get_object()
        
        exercise_id = request.data.get('exercise')
        if not exercise_id:
            logger.warning("add_variant falló: Falta ID de ejercicio")
            return Response({'error': 'Se requiere un ejercicio'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            exercise = Exercise.objects.get(id=exercise_id)
        except Exercise.DoesNotExist:
            logger.warning(f"add_variant falló: Ejercicio {exercise_id} no encontrado")
            return Response({'error': 'Ejercicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        logger.info(f"Añadiendo variante ejercicio {exercise.name} a ejercicio de rutina {parent_exercise.id}")
        variant = RoutineExercise.objects.create(
            routine_day=parent_exercise.routine_day,
            exercise=exercise,
            order=parent_exercise.order,
            target_sets=request.data.get('target_sets', 3),
            target_reps=request.data.get('target_reps', 10),
            target_weight=request.data.get('target_weight', 0),
            rest_seconds=parent_exercise.rest_seconds,
            variant_of=parent_exercise,
            is_active_variant=False  # New variants are inactive by default
        )
        
        serializer = self.get_serializer(variant)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsRoutineOwner])
    def set_active_variant(self, request, pk=None):
        """
        Establece este ejercicio (o su variante) como el activo.
        All other variants of the same parent become inactive.
        """
        exercise = self.get_object()
        logger.info(f"Estableciendo variante activa: {exercise.id} ({exercise.custom_name or 'No Name'})")
        
        # Find the parent - could be self if this is the parent, or variant_of if it's a variant
        if exercise.variant_of:
            parent = exercise.variant_of
        else:
            parent = exercise
        
        # Deactivate all in the family
        parent.is_active_variant = False
        parent.save()
        parent.variants.update(is_active_variant=False)
        
        # Activate the selected one
        exercise.is_active_variant = True
        exercise.save()
        
        # Return the parent with all variants
        serializer = self.get_serializer(parent)
        return Response(serializer.data)


class ExerciseSetViewSet(viewsets.ModelViewSet):
    serializer_class = ExerciseSetSerializer
    permission_classes = [IsAuthenticated, IsRoutineOwner]

    def get_queryset(self):
        user = self.request.user
        logger.info(f"ExerciseSetViewSet.get_queryset called by user: {user}")
        queryset = ExerciseSet.objects.filter(user=user).select_related(
            "routine_exercise__routine_day__routine"
        )
        routine_exercise = self.request.query_params.get('routine_exercise', None)
        if routine_exercise:
            logger.info(f"Filtrando series por routine_exercise: {routine_exercise}")
            queryset = queryset.filter(routine_exercise_id=routine_exercise)
        return queryset

    def perform_create(self, serializer):
        routine_exercise = serializer.validated_data.get("routine_exercise")
        if routine_exercise.routine_day.routine.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            logger.warning(f"Permiso denegado creando serie: Usuario {self.request.user} intentó añadir a rutina de {routine_exercise.routine_day.routine.user}")
            raise PermissionDenied("No puedes registrar series para esta rutina.")
        
        logger.info(f"Creando serie para ejercicio {routine_exercise.id} por usuario {self.request.user}")
        serializer.save(user=self.request.user)




class ExerciseViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar ejercicios.
    Los ejercicios son globales (catálogo compartido).
    - Lectura: cualquier usuario autenticado
    - Creación/Modificación/Eliminación: solo superusuarios
    """
    serializer_class = ExerciseSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        """
        Solo superusuarios pueden crear, modificar o eliminar ejercicios.
        Usuarios normales solo pueden leer.
        """
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return [IsAuthenticated()]

    def get_queryset(self):
        # Log entry for debugging/monitoring
        user = self.request.user if hasattr(self.request, 'user') else 'Anonymous'
        logger.info(f"ExerciseViewSet.get_queryset solicitado por usuario: {user}")

        queryset = Exercise.objects.all().prefetch_related("media")
        
        # Permitir búsqueda por nombre
        name = self.request.query_params.get('name', None)
        if name:
            logger.info(f"Filtrando ejercicios por name: {name}")
            queryset = queryset.filter(name__icontains=name)
        
        # Filter by is_custom
        is_custom = self.request.query_params.get('is_custom', None)
        if is_custom is not None:
            is_custom_bool = is_custom.lower() == 'true'
            logger.info(f"Filtrando ejercicios por is_custom: {is_custom_bool}")
            queryset = queryset.filter(is_custom=is_custom_bool)
        
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        logger.info(f"Creando nuevo ejercicio por usuario: {user}")
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        logger.info(f"Actualizando ejercicio {serializer.instance.id} ({serializer.instance.name}) por usuario: {user}")
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        logger.warning(f"Eliminando ejercicio {instance.id} ({instance.name}) por usuario: {user}")
        instance.delete()

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def get_or_create(self, request):
        """
        Obtiene un ejercicio existente por nombre o lo crea si no existe.
        """
        name = request.data.get('name', '').strip()
        logger.info(f"ExerciseViewSet.get_or_create solicitado para nombre: '{name}'")
        if not name:
            return Response({'error': 'El nombre es requerido'}, status=400)
        
        exercise, created = Exercise.objects.get_or_create(
            name__iexact=name,
            defaults={
                'name': name,
                'description': request.data.get('description', ''),
                'default_sets': request.data.get('default_sets', 3),
                'default_reps': request.data.get('default_reps', 10),
                'default_weight': request.data.get('default_weight', 0),
                'icon': request.data.get('icon', 'fitness_center'),
                'is_custom': request.data.get('is_custom', True),  # Default to True, but allow override
            }
        )
        
        serializer = self.get_serializer(exercise)
        return Response({
            'exercise': serializer.data,
            'created': created
        })

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def upload_images(self, request, pk=None):
        """
        Sube y optimiza múltiples imágenes para un ejercicio.
        """
        exercise = self.get_object()
        logger.info(f"ExerciseViewSet.upload_images solicitado para ejercicio {exercise.id} ({exercise.name}). Archivos: {len(request.FILES.getlist('images'))}")
        
        images = request.FILES.getlist('images')
        if not images:
            return Response({'error': 'No se proporcionaron imágenes'}, status=status.HTTP_400_BAD_REQUEST)
        
        uploaded_media = []
        current_order = exercise.media.count()
        
        for image_file in images:
            try:
                # Optimizar la imagen
                optimized_image = optimize_exercise_image(image_file)
                
                # Crear registro de media
                media = ExerciseMedia.objects.create(
                    exercise=exercise,
                    file=optimized_image,
                    media_type='image',
                    order=current_order
                )
                uploaded_media.append(ExerciseMediaSerializer(media, context={'request': request}).data)
                current_order += 1
            except Exception as e:
                # Continuar con las demás imágenes si una falla
                continue
        
        return Response({
            'uploaded': uploaded_media,
            'count': len(uploaded_media)
        })

    @action(detail=True, methods=['delete'], permission_classes=[permissions.IsAdminUser], url_path='delete_image/(?P<media_id>[^/.]+)')
    def delete_image(self, request, pk=None, media_id=None):
        """
        Elimina una imagen específica de un ejercicio.
        """
        exercise = self.get_object()
        logger.info(f"ExerciseViewSet.delete_image solicitado para ejercicio {exercise.id}, media_id {media_id}")
        
        try:
            media = ExerciseMedia.objects.get(id=media_id, exercise=exercise)
            media.file.delete(save=False)
            media.delete()
            return Response({'message': 'Imagen eliminada'})
        except ExerciseMedia.DoesNotExist:
            return Response({'error': 'Imagen no encontrada'}, status=status.HTTP_404_NOT_FOUND)



class IsSuperUser(permissions.BasePermission):
    """Permission class to restrict access to superusers only"""
    def has_permission(self, request, view):
        return request.user and request.user.is_superuser


class MotivationalImageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing motivational images.
    - List, Create, Update, Delete: Admin only
    - get_next: Get next image based on smart rotation
    - mark_shown: Mark an image as shown for a user
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def get_queryset(self):
        from .models import MotivationalImage
        return MotivationalImage.objects.all().order_by('group', 'order', '-created_at')
    
    def get_serializer_class(self):
        from .serializers import MotivationalImageSerializer, MotivationalImageListSerializer
        if self.action == 'list':
            return MotivationalImageListSerializer
        return MotivationalImageSerializer
    
    def get_permissions(self):
        """Admin endpoints require superuser, get_next/mark_shown require auth"""
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'list', 'retrieve']:
            return [IsAuthenticated(), IsSuperUser()]
        return [IsAuthenticated()]
    

    @action(detail=False, methods=['post'])
    def get_next(self, request):
        # ... existing naming ...
        group = request.data.get('group')
        logger.info(f"MotivationalImage: get_next solicitado para grupo '{group}' por usuario {request.user}")
        
        if not group:
            return Response({'error': 'group is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get all active images for this group
        available_images = list(
            MotivationalImage.objects.filter(group=group, is_active=True)
                .order_by('order', '-created_at')
        )
        
        if not available_images:
            return Response(status=status.HTTP_204_NO_CONTENT)
        
        # Get or create user history for this group
        history, created = UserMotivationHistory.objects.get_or_create(
            user=request.user,
            group=group,
            defaults={'shown_images_cycle': [], 'cycle_count': 0}
        )
        
        available_ids = [img.id for img in available_images]
        shown_ids = history.shown_images_cycle or []
        
        # Case 1: First time or cycle incomplete - show unseen image
        unseen_images = [img for img in available_images if img.id not in shown_ids]
        
        if unseen_images:
            # Randomly select from unseen images
            selected_image = random.choice(unseen_images)
        else:
            # Case 2: Cycle complete - reset and avoid last image
            history.cycle_count += 1
            history.shown_images_cycle = []
            history.save()
            
            # Try to avoid showing the last image immediately
            if history.last_image_shown and len(available_images) > 1:
                candidate_images = [img for img in available_images if img.id != history.last_image_shown.id]
                selected_image = random.choice(candidate_images) if candidate_images else available_images[0]
            else:
                selected_image = random.choice(available_images)
        
        # Return the selected image (don't mark as shown yet - that's done via mark_shown)
        serializer = MotivationalImageSerializer(selected_image, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def mark_shown(self, request):
        """
        Mark an image as shown for the user.
        
        Request body:
        {
            "image_id": 123,
            "group": "welcome"
        }
        """
        from .models import MotivationalImage, UserMotivationHistory
        
        image_id = request.data.get('image_id')
        group = request.data.get('group')
        logger.info(f"MotivationalImage: mark_shown solicitado para imagen {image_id} grupo '{group}' por usuario {request.user}")
        
        if not image_id or not group:
            return Response(
                {'error': 'image_id and group are required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            image = MotivationalImage.objects.get(id=image_id, group=group)
        except MotivationalImage.DoesNotExist:
            return Response({'error': 'Image not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Update user history
        history, created = UserMotivationHistory.objects.get_or_create(
            user=request.user,
            group=group,
            defaults={'shown_images_cycle': [], 'cycle_count': 0}
        )
        
        # Add to shown images if not already there
        if image_id not in history.shown_images_cycle:
            history.shown_images_cycle.append(image_id)
        
        history.last_image_shown = image
        history.save()
        
        return Response({'message': 'Image marked as shown', 'cycle_count': history.cycle_count})

