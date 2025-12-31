from django.db.models import Sum, Avg, Max
from django.db.models.functions import TruncDate
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Routine, RoutineExercise, ExerciseSet
from .serializers import (
    RoutineSerializer,
    RoutineExerciseDetailSerializer,
    ExerciseSetSerializer,
)


class IsRoutineOwner(permissions.BasePermission):
    """
    Asegura que el usuario autenticado sea el dueño de la rutina.
    """

    def has_object_permission(self, request, view, obj):
        if isinstance(obj, Routine):
            return obj.user == request.user
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


class RoutineExerciseViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RoutineExerciseDetailSerializer
    permission_classes = [IsAuthenticated, IsRoutineOwner]

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
            )
            .order_by("day")
        )
        return Response(list(points))


class ExerciseSetViewSet(viewsets.ModelViewSet):
    serializer_class = ExerciseSetSerializer
    permission_classes = [IsAuthenticated, IsRoutineOwner]

    def get_queryset(self):
        return ExerciseSet.objects.filter(user=self.request.user).select_related(
            "routine_exercise__routine_day__routine"
        )

    def perform_create(self, serializer):
        routine_exercise = serializer.validated_data.get("routine_exercise")
        if routine_exercise.routine_day.routine.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("No puedes registrar series para esta rutina.")
        serializer.save(user=self.request.user)









