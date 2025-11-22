from django.shortcuts import render, redirect

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Ticket
from .serializers import TicketSerializer
from django.views.generic import TemplateView

from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend

from .models import PortfolioPhoto
from .serializers import PortfolioPhotoSerializer

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import PortfolioPhoto
from .serializers import PortfolioPhotoSerializer
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.http import HttpResponseRedirect
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes

from .models import Dibujos
from .serializers import DibujosSerializer
from .permissions import IsAdminOrReadOnly

class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # Solo mostrar tickets del usuario autenticado
        queryset = Ticket.objects.filter(usuario=self.request.user)
        
        # Aplicar filtros de fecha
        fecha_gte = self.request.GET.get('fecha__gte')
        fecha_lte = self.request.GET.get('fecha__lte')
        
        if fecha_gte:
            queryset = queryset.filter(fecha__gte=fecha_gte)
        if fecha_lte:
            queryset = queryset.filter(fecha__lte=fecha_lte)
        
        # Ordenamiento
        ordering = self.request.GET.get('ordering', '-fecha')
        queryset = queryset.order_by(ordering)
            
        return queryset
    
    def perform_create(self, serializer):
        # Si es admin y se especifica un usuario, usarlo; sino, usar el usuario autenticado
        if self.request.user.is_staff and 'usuario' in self.request.data:
            # Admin puede crear tickets para otros usuarios
            serializer.save()
        else:
            # Usuario normal solo puede crear tickets para sí mismo
            serializer.save(usuario=self.request.user)

    @action(detail=False, methods=["get"])
    def total_entre_fechas(self, request):
        """
        Devuelve la suma de los tickets entre 2 fechas del usuario autenticado.
        Parámetros esperados: ?inicio=YYYY-MM-DD&fin=YYYY-MM-DD
        """
        inicio = request.query_params.get("inicio")
        fin = request.query_params.get("fin")

        if not inicio or not fin:
            return Response({"error": "Debes indicar los parámetros 'inicio' y 'fin'."}, status=400)

        try:
            # Solo sumar tickets del usuario autenticado
            total = Ticket.objects.filter(
                usuario=request.user,
                fecha__date__gte=inicio,
                fecha__date__lte=fin
            ).aggregate(suma=Sum("coste"))["suma"] or 0
        except Exception as e:
            return Response({"error": str(e)}, status=400)

        return Response({
            "inicio": inicio,
            "fin": fin,
            "total": f"{total} EUR"
        })
        



class PortfolioPhotoViewSet(viewsets.ModelViewSet):
    """
    Solo permite una única imagen de portafolio.
    Si ya existe, el POST actualizará la existente.
    """
    queryset = PortfolioPhoto.objects.all()
    serializer_class = PortfolioPhotoSerializer
    permission_classes = [IsAdminOrReadOnly]

    def create(self, request, *args, **kwargs):
        """
        Si ya hay una imagen, se actualiza en lugar de crear una nueva.
        """
        existing = PortfolioPhoto.objects.first()

        if existing:
            # Si ya hay una, actualizamos la existente
            serializer = self.get_serializer(existing, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(
                {"message": "Imagen actualizada correctamente", "data": serializer.data},
                status=status.HTTP_200_OK
            )
        else:
            # Si no existe, creamos la primera
            return super().create(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        """
        Siempre devuelve solo una imagen (la primera) o vacío si no hay.
        """
        instance = PortfolioPhoto.objects.first()
        if not instance:
            return Response([], status=status.HTTP_200_OK)
        serializer = self.get_serializer(instance)
        return Response([serializer.data], status=status.HTTP_200_OK)

    def retrieve(self, request, *args, **kwargs):
        """
        Siempre devuelve la única imagen existente (sin necesidad de ID).
        """
        instance = PortfolioPhoto.objects.first()
        if not instance:
            return Response(
                {"detail": "No hay imagen creada aún."},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

class DibujosViewSet(viewsets.ModelViewSet):
    queryset = Dibujos.objects.all().order_by('-pin', '-fecha_creacion')
    serializer_class = DibujosSerializer
    permission_classes = [IsAdminOrReadOnly]


def api_login_page(request):
    """
    Página de inicio de sesión para la API.
    GET: renderiza formulario
    POST: autentica y establece cookies JWT
    """
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')

        if not username or not password:
            return render(request, 'api/login.html', {
                'error': 'Usuario y contraseña son obligatorios'
            })

        user = authenticate(request=request, username=username, password=password)

        if user is None:
            return render(request, 'api/login.html', {
                'error': 'Credenciales inválidas'
            })

        # Generar tokens JWT
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        # Redirigir tras login a la API
        response = HttpResponseRedirect('/api/')

        # Configurar cookies httponly
        response.set_cookie(
            key='access_token',
            value=access_token,
            httponly=True,
            secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
            samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
            max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
        )

        response.set_cookie(
            key='refresh_token',
            value=refresh_token,
            httponly=True,
            secure=settings.SIMPLE_JWT.get('AUTH_COOKIE_SECURE', False),
            samesite=settings.SIMPLE_JWT.get('AUTH_COOKIE_SAMESITE', 'Lax'),
            max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
        )

        return response

    # Si ya está autenticado, mostrar página con usuario y botón logout
    user = getattr(request, 'user', None)
    ctx = {}
    if user and user.is_authenticated:
        ctx['current_username'] = user.username
    return render(request, 'api/login.html', ctx)


# ==================== TELEGRAM PROFILE API ====================
from rest_framework import generics
from rest_framework.permissions import IsAdminUser
from django.contrib.auth.models import User
from tickets.models import TelegramProfile
from .serializers import TelegramProfileSerializer, UserTelegramSerializer
from .permissions import IsAdminOrStaff


@api_view(['GET'])
@permission_classes([IsAdminOrStaff])
def get_telegram_id_by_username(request):
    """
    Endpoint para que el bot obtenga el telegram_id de un usuario por su username.
    Solo accesible por usuarios admin.
    GET /api/telegram/user/<username>/
    """
    username = request.GET.get('username')
    
    if not username:
        return Response({
            'error': 'Se requiere el parámetro username'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        user = User.objects.get(username=username)
        profile, created = TelegramProfile.objects.get_or_create(user=user)
        
        if not profile.telegram_id:
            return Response({
                'error': f'El usuario {username} no tiene un ID de Telegram configurado',
                'username': username,
                'telegram_id': None
            }, status=status.HTTP_404_NOT_FOUND)
        
        return Response({
            'username': username,
            'telegram_id': profile.telegram_id,
            'user_id': user.id
        }, status=status.HTTP_200_OK)
        
    except User.DoesNotExist:
        return Response({
            'error': f'Usuario {username} no encontrado'
        }, status=status.HTTP_404_NOT_FOUND)


class UserDetailView(generics.RetrieveUpdateAPIView):
    """
    Vista para obtener y actualizar datos de un usuario incluyendo su telegram_id.
    Solo accesible por el propio usuario o admin.
    """
    queryset = User.objects.all()
    serializer_class = UserTelegramSerializer
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        user_id = self.kwargs.get('pk')
        user = User.objects.get(pk=user_id)
        
        # Solo el propio usuario o admin puede ver/editar
        if self.request.user.id != user.id and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("No tienes permiso para acceder a este usuario")
        
        return user


class TelegramProfileListView(generics.ListAPIView):
    """
    Lista todos los perfiles de Telegram.
    Solo accesible por admin.
    """
    queryset = TelegramProfile.objects.all()
    serializer_class = TelegramProfileSerializer
    permission_classes = [IsAdminOrStaff]