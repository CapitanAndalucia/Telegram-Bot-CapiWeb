from django.db.models import Sum, Avg, Max, Count
from django.db.models.functions import TruncDate
from rest_framework import permissions, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Routine, RoutineDay, RoutineExercise, ExerciseSet, Exercise, ExerciseMedia
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

    def get_queryset(self):
        return Routine.objects.filter(user=self.request.user).prefetch_related(
            "days__routine_exercises__exercise__media"
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RoutineDayViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar días de rutina y sus imágenes.
    """
    serializer_class = RoutineDaySerializer
    permission_classes = [IsAuthenticated, IsRoutineOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return RoutineDay.objects.filter(
            routine__user=self.request.user
        ).prefetch_related("routine_exercises__exercise__media")

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsRoutineOwner])
    def upload_image(self, request, pk=None):
        """
        Sube y optimiza una imagen para un día de rutina.
        """
        day = self.get_object()
        
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
        return RoutineExercise.objects.filter(
            routine_day__routine__user=self.request.user
        ).prefetch_related("exercise__media", "sets")

    @action(detail=True, methods=["get"], permission_classes=[IsAuthenticated, IsRoutineOwner])
    def progress(self, request, pk=None):
        """
        Devuelve datos agregados para la gráfica de progreso del ejercicio.
        """
        exercise = self.get_object()
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
            return Response({'error': 'Se requiere un ejercicio'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            exercise = Exercise.objects.get(id=exercise_id)
        except Exercise.DoesNotExist:
            return Response({'error': 'Ejercicio no encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        # Create variant linked to parent
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
        queryset = ExerciseSet.objects.filter(user=self.request.user).select_related(
            "routine_exercise__routine_day__routine"
        )
        routine_exercise = self.request.query_params.get('routine_exercise', None)
        if routine_exercise:
            queryset = queryset.filter(routine_exercise_id=routine_exercise)
        return queryset

    def perform_create(self, serializer):
        routine_exercise = serializer.validated_data.get("routine_exercise")
        if routine_exercise.routine_day.routine.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("No puedes registrar series para esta rutina.")
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
        queryset = Exercise.objects.all().prefetch_related("media")
        # Permitir búsqueda por nombre
        name = self.request.query_params.get('name', None)
        if name:
            queryset = queryset.filter(name__icontains=name)
        return queryset

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def get_or_create(self, request):
        """
        Obtiene un ejercicio existente por nombre o lo crea si no existe.
        """
        name = request.data.get('name', '').strip()
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
        
        try:
            media = ExerciseMedia.objects.get(id=media_id, exercise=exercise)
            media.file.delete(save=False)
            media.delete()
            return Response({'message': 'Imagen eliminada'})
        except ExerciseMedia.DoesNotExist:
            return Response({'error': 'Imagen no encontrada'}, status=status.HTTP_404_NOT_FOUND)







