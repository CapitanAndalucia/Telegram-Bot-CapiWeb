"""
api/views.py
============

Módulo de vistas de la API REST del backend.

Este módulo contiene los ViewSets y vistas que gestionan las operaciones CRUD
para los diferentes recursos de la aplicación, incluyendo tickets, portfolio,
dibujos, proyectos y perfiles de Telegram.

Clases principales:
    - TicketViewSet: Gestión de tickets/gastos del usuario
    - PortfolioPhotoViewSet: Gestión de foto de portfolio (singleton)
    - DibujosViewSet: Gestión de galería de dibujos/arte
    - TecnologiaViewSet: Gestión de tecnologías del portfolio
    - ProyectoViewSet: Gestión de proyectos del portfolio
    - UserDetailView: Vista de detalle y edición de usuario
    - TelegramProfileListView: Lista de perfiles de Telegram

Autenticación:
    Todas las vistas requieren autenticación JWT mediante cookies HTTP-only.
    Algunas vistas requieren permisos de administrador.
"""

from django.shortcuts import render, redirect

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Ticket, Tecnologia, Proyecto
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
from .serializers import DibujosSerializer, TecnologiaSerializer, ProyectoSerializer
from .permissions import IsAdminOrReadOnly
import logging

logger = logging.getLogger(__name__)


class TicketViewSet(viewsets.ModelViewSet):
    """
    ViewSet para la gestión de tickets/gastos de usuarios.
    
    Este ViewSet permite a los usuarios autenticados crear, leer, actualizar
    y eliminar sus propios tickets de gastos. Los administradores pueden
    gestionar tickets de cualquier usuario.
    
    Endpoints:
        GET    /api/tickets/           - Lista todos los tickets del usuario
        POST   /api/tickets/           - Crea un nuevo ticket
        GET    /api/tickets/{id}/      - Obtiene un ticket específico
        PUT    /api/tickets/{id}/      - Actualiza un ticket completo
        PATCH  /api/tickets/{id}/      - Actualiza parcialmente un ticket
        DELETE /api/tickets/{id}/      - Elimina un ticket
        GET    /api/tickets/total_entre_fechas/ - Suma de gastos entre fechas
    
    Parámetros de filtrado (GET):
        fecha__gte: Fecha mínima (formato YYYY-MM-DD)
        fecha__lte: Fecha máxima (formato YYYY-MM-DD)
        ordering: Campo de ordenamiento (default: '-fecha')
    
    Permisos:
        - Requiere autenticación
        - Usuarios ven solo sus propios tickets
        - Administradores pueden ver/crear tickets de otros usuarios
    """
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Obtiene el queryset de tickets filtrado por usuario.
        
        Filtra los tickets para mostrar solo los del usuario autenticado
        y aplica filtros opcionales de fecha y ordenamiento.
        
        Retorna:
            QuerySet: Tickets filtrados y ordenados del usuario actual.
        """
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
        """
        Ejecuta la creación de un nuevo ticket.
        
        Si el usuario es administrador y especifica un usuario en los datos,
        crea el ticket para ese usuario. De lo contrario, asigna el ticket
        al usuario autenticado.
        
        Args:
            serializer: Serializador con los datos validados del ticket.
        """
        # Si es admin y se especifica un usuario, usarlo; sino, usar el usuario autenticado
        if self.request.user.is_staff and 'usuario' in self.request.data:
            # Admin puede crear tickets para otros usuarios
            serializer.save()
        else:
            # Usuario normal solo puede crear tickets para sí mismo
            serializer.save(usuario=self.request.user)
        
        logger.info(f"Ticket created by {self.request.user.username}: {serializer.data.get('titulo', 'No title')}")

    @action(detail=False, methods=["get"])
    def total_entre_fechas(self, request):
        """
        Calcula el total de gastos entre dos fechas.
        
        Acción personalizada que suma los costes de todos los tickets
        del usuario autenticado dentro del rango de fechas especificado.
        
        Endpoint:
            GET /api/tickets/total_entre_fechas/?inicio=YYYY-MM-DD&fin=YYYY-MM-DD
        
        Args:
            request: Objeto de petición HTTP con los parámetros 'inicio' y 'fin'.
        
        Parámetros de query (obligatorios):
            inicio (str): Fecha de inicio en formato YYYY-MM-DD
            fin (str): Fecha de fin en formato YYYY-MM-DD
        
        Retorna:
            Response: JSON con las fechas y el total sumado en EUR.
            
        Ejemplo de respuesta exitosa:
            {
                "inicio": "2024-01-01",
                "fin": "2024-12-31",
                "total": "150.50 EUR"
            }
        
        Errores:
            400: Falta algún parámetro o error en el cálculo.
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
    ViewSet para gestión de la foto de portfolio (patrón Singleton).
    
    Este ViewSet implementa un patrón singleton para la imagen de portfolio,
    permitiendo solo una imagen a la vez. Si ya existe una imagen y se intenta
    crear otra, se actualiza la existente en lugar de crear una nueva.
    
    Endpoints:
        GET    /api/portfolio-photo/     - Obtiene la imagen de portfolio
        POST   /api/portfolio-photo/     - Crea/actualiza la imagen
        PUT    /api/portfolio-photo/{id}/ - Actualiza la imagen
        DELETE /api/portfolio-photo/{id}/ - Elimina la imagen
    
    Permisos:
        - Lectura: Público (cualquier usuario)
        - Escritura: Solo administradores
    
    Comportamiento especial:
        - list() siempre devuelve máximo 1 elemento
        - create() actualiza si ya existe una imagen
        - retrieve() devuelve la única imagen sin necesidad de ID
    """
    queryset = PortfolioPhoto.objects.all()
    serializer_class = PortfolioPhotoSerializer
    permission_classes = [IsAdminOrReadOnly]

    def create(self, request, *args, **kwargs):
        """
        Crea o actualiza la imagen de portfolio.
        
        Si ya existe una imagen, la actualiza con los nuevos datos.
        Si no existe, crea una nueva imagen de portfolio.
        
        Args:
            request: Petición HTTP con datos de la imagen (multipart/form-data)
            *args: Argumentos posicionales adicionales
            **kwargs: Argumentos de palabra clave adicionales
        
        Datos esperados (multipart/form-data):
            image: Archivo de imagen (JPEG, PNG, etc.)
        
        Retorna:
            Response: JSON con mensaje de éxito y datos de la imagen.
            - 200 OK si se actualizó una existente
            - 201 Created si se creó una nueva
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
            logger.info(f"Creating new Portfolio Photo by {request.user.username}")
            return super().create(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        """
        Lista la imagen de portfolio (máximo 1 elemento).
        
        Devuelve un array con la única imagen de portfolio existente,
        o un array vacío si no hay ninguna imagen configurada.
        
        Args:
            request: Petición HTTP GET
            *args: Argumentos posicionales adicionales
            **kwargs: Argumentos de palabra clave adicionales
        
        Retorna:
            Response: Array JSON con 0 o 1 imagen:
            - [] si no hay imagen
            - [{...datos_imagen...}] si existe
        """
        instance = PortfolioPhoto.objects.first()
        if not instance:
            return Response([], status=status.HTTP_200_OK)
        serializer = self.get_serializer(instance)
        return Response([serializer.data], status=status.HTTP_200_OK)

    def retrieve(self, request, *args, **kwargs):
        """
        Obtiene la imagen de portfolio.
        
        Ignora el parámetro ID y devuelve siempre la única imagen
        de portfolio existente, implementando el patrón singleton.
        
        Args:
            request: Petición HTTP GET
            *args: Argumentos posicionales adicionales
            **kwargs: Argumentos con 'pk' (ignorado)
        
        Retorna:
            Response: JSON con los datos de la imagen.
            - 200 OK con datos si existe
            - 404 Not Found si no hay imagen
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
    """
    ViewSet para la gestión de la galería de dibujos/arte.
    
    Permite operaciones CRUD sobre los dibujos del portfolio artístico.
    Los dibujos se ordenan por pin (destacados primero) y fecha de creación.
    
    Endpoints:
        GET    /api/dibujos/        - Lista todos los dibujos
        POST   /api/dibujos/        - Crea un nuevo dibujo
        GET    /api/dibujos/{id}/   - Obtiene un dibujo específico
        PUT    /api/dibujos/{id}/   - Actualiza un dibujo
        PATCH  /api/dibujos/{id}/   - Actualiza parcialmente un dibujo
        DELETE /api/dibujos/{id}/   - Elimina un dibujo
    
    Campos del modelo:
        - descripcion: Descripción del dibujo
        - imagen: Archivo de imagen
        - palabras_clave: Tags/keywords separados por comas
        - fecha_creacion: Fecha de creación (auto)
        - pin: Boolean para destacar el dibujo
    
    Ordenamiento:
        Por defecto se ordenan primero los destacados (pin=True),
        luego por fecha de creación descendente.
    
    Permisos:
        - Lectura: Público
        - Escritura: Solo administradores
    """
    queryset = Dibujos.objects.all().order_by('-pin', '-fecha_creacion')
    serializer_class = DibujosSerializer
    permission_classes = [IsAdminOrReadOnly]


def api_login_page(request):
    """
    Página de inicio de sesión para la API (basada en formulario HTML).
    
    Esta vista renderiza un formulario HTML para autenticar usuarios
    y establecer las cookies JWT necesarias para acceder a la API.
    
    URL:
        GET/POST /api/login/
    
    Métodos HTTP:
        GET: Renderiza el formulario de login.
             Si el usuario ya está autenticado, muestra su nombre.
        
        POST: Procesa el formulario de autenticación:
              1. Valida las credenciales
              2. Genera tokens JWT (access y refresh)
              3. Establece cookies HTTP-only
              4. Redirige a /api/
    
    Parámetros POST:
        username (str): Nombre de usuario
        password (str): Contraseña
    
    Cookies establecidas (POST exitoso):
        access_token: Token JWT de acceso (corta duración)
        refresh_token: Token JWT de refresco (larga duración)
    
    Retorna:
        GET: Renderiza template 'api/login.html'
        POST exitoso: Redirige a '/api/' con cookies JWT
        POST fallido: Renderiza template con mensaje de error
    
    Seguridad:
        Las cookies se configuran como HTTP-only para prevenir ataques XSS.
        La configuración de secure y samesite se toma de SIMPLE_JWT settings.
    """
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')

        if not username or not password:
            return render(request, 'api/login.html', {
                'error': 'Usuario y contraseña son obligatorios'
            })
        
        logger.info(f"Login attempt for user: {username}")

        user = authenticate(request=request, username=username, password=password)

        if user is None:
            return render(request, 'api/login.html', {
                'error': 'Credenciales inválidas'
            })
        
        logger.info(f"Login successful for user: {username}")

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

class TecnologiaViewSet(viewsets.ModelViewSet):
    """
    ViewSet para la gestión de tecnologías del portfolio.
    
    Permite operaciones CRUD sobre las tecnologías que se muestran
    en los proyectos del portfolio profesional.
    
    Endpoints:
        GET    /api/tecnologias/        - Lista todas las tecnologías
        POST   /api/tecnologias/        - Crea una nueva tecnología
        GET    /api/tecnologias/{id}/   - Obtiene una tecnología específica
        PUT    /api/tecnologias/{id}/   - Actualiza una tecnología
        PATCH  /api/tecnologias/{id}/   - Actualiza parcialmente
        DELETE /api/tecnologias/{id}/   - Elimina una tecnología
    
    Campos del modelo:
        - id: Identificador único
        - nombre: Nombre de la tecnología (ej: "Python", "Angular")
        - icono: URL o ruta al icono de la tecnología
    
    Permisos:
        Por defecto, operaciones CRUD estándar sin restricciones adicionales.
    """
    queryset = Tecnologia.objects.all()
    serializer_class = TecnologiaSerializer


class ProyectoViewSet(viewsets.ModelViewSet):
    """
    ViewSet para la gestión de proyectos del portfolio.
    
    Permite operaciones CRUD sobre los proyectos que se muestran
    en el portfolio profesional. Cada proyecto puede estar asociado
    a múltiples tecnologías.
    
    Endpoints:
        GET    /api/proyectos/        - Lista todos los proyectos
        POST   /api/proyectos/        - Crea un nuevo proyecto
        GET    /api/proyectos/{id}/   - Obtiene un proyecto específico
        PUT    /api/proyectos/{id}/   - Actualiza un proyecto
        PATCH  /api/proyectos/{id}/   - Actualiza parcialmente
        DELETE /api/proyectos/{id}/   - Elimina un proyecto
    
    Campos del modelo:
        - id: Identificador único
        - titulo: Título del proyecto
        - descripcion: Descripción detallada
        - imagen: Imagen/captura del proyecto
        - tecnologias: M2M con Tecnologia (lectura)
        - tecnologias_ids: IDs de tecnologías (escritura)
    
    Permisos:
        Por defecto, operaciones CRUD estándar sin restricciones adicionales.
    """
    queryset = Proyecto.objects.all()
    serializer_class = ProyectoSerializer

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
    Obtiene el ID de Telegram de un usuario por su nombre de usuario.
    
    Este endpoint es utilizado por el bot de Telegram para obtener
    el ID de Telegram asociado a un usuario del sistema.
    
    Endpoint:
        GET /api/telegram/user/?username=<username>
    
    Parámetros de query:
        username (str, obligatorio): Nombre de usuario a buscar
    
    Permisos:
        Solo accesible por administradores o staff.
    
    Retorna:
        200 OK: Usuario encontrado con ID de Telegram configurado
            {
                "username": "john_doe",
                "telegram_id": 123456789,
                "user_id": 42
            }
        
        400 Bad Request: Falta el parámetro username
            {"error": "Se requiere el parámetro username"}
        
        404 Not Found: Usuario no existe o no tiene Telegram configurado
            {"error": "El usuario X no tiene un ID de Telegram configurado"}
            {"error": "Usuario X no encontrado"}
    
    Uso por el bot:
        El bot de Telegram utiliza este endpoint para vincular
        cuentas de usuario con sus chats de Telegram.
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