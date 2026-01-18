from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from .throttles import RegisterThrottle
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from axes.utils import reset
from .captcha import verify_recaptcha


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([RegisterThrottle])
def register_view(request):
    """
    Registro de nuevo usuario.
    Espera: username, password, email (opcional)
    """
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    email = request.data.get('email', '').strip()
    # Si el frontend envía el token de reCAPTCHA y la verificación está activada, comprobarlo
    captcha_token = request.data.get('g-recaptcha-response') or request.data.get('captcha')
    if getattr(settings, 'RECAPTCHA_ENABLED', False) and getattr(settings, 'RECAPTCHA_SECRET', None):
        ok, err = verify_recaptcha(captcha_token, remote_ip=request.META.get('REMOTE_ADDR'))
        if not ok:
            return Response({'error': 'Captcha inválido: ' + str(err)}, status=status.HTTP_400_BAD_REQUEST)
    
    if not username or not password:
        return Response(
            {'error': 'Se requiere username y password'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if User.objects.filter(username=username).exists():
        return Response(
            {'error': 'El usuario ya existe'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Verificar unicidad de email si se proporcionó
    if email:
        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {'error': 'El email ya está en uso'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    # Crear usuario sin validaciones de contraseña
    try:
        user = User(username=username, email=email)
        user.set_password(password)  # Esto hashea la contraseña sin validarla
        user.save()
    except Exception as e:
        return Response(
            {'error': f'Error al crear usuario: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Generar tokens JWT
    refresh = RefreshToken.for_user(user)
    access_token = str(refresh.access_token)
    refresh_token = str(refresh)
    
    # Crear respuesta con tokens en cookies httponly
    response = Response({
        'message': 'Usuario registrado exitosamente',
        'username': user.username
    }, status=status.HTTP_201_CREATED)
    
    # Configurar cookies httponly
    response.set_cookie(
        key='access_token',
        value=access_token,
        httponly=True,
        secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
        samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
        max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
    )
    
    response.set_cookie(
        key='refresh_token',
        value=refresh_token,
        httponly=True,
        secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
        samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
    )
    
    # Resetear contadores de fallos en Axes al login correcto
    try:
        reset(request)
    except Exception:
        pass
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def login_view(request):
    """
    Login de usuario.
    Espera: username, password
    """
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response(
            {'error': 'Se requiere username y password'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Autenticar usuario (Axes requiere request)
    user = authenticate(request=request, username=username, password=password)
    
    if user is None:
        return Response(
            {'error': 'Credenciales inválidas'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    # Generar tokens JWT
    refresh = RefreshToken.for_user(user)
    access_token = str(refresh.access_token)
    refresh_token = str(refresh)
    
    # Crear respuesta con tokens en cookies httponly
    response = Response({
        'message': 'Login exitoso',
        'username': user.username
    }, status=status.HTTP_200_OK)
    
    # Configurar cookies httponly
    response.set_cookie(
        key='access_token',
        value=access_token,
        httponly=True,
        secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
        samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
        max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
    )
    
    response.set_cookie(
        key='refresh_token',
        value=refresh_token,
        httponly=True,
        secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
        samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
    )
    
    return response

# Asignar scope para login (register ahora usa RegisterThrottle)
login_view.throttle_scope = 'login'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Logout de usuario - elimina las cookies
    """
    response = Response({
        'message': 'Logout exitoso'
    }, status=status.HTTP_200_OK)
    
    # Intentar invalidar refresh token (si hay blacklist habilitado)
    try:
        refresh_token = request.COOKIES.get('refresh_token')
        if refresh_token and settings.SIMPLE_JWT.get('BLACKLIST_AFTER_ROTATION', False):
            token = RefreshToken(refresh_token)
            token.blacklist()
    except Exception:
        pass

    # Intentar invalidar refresh token (si hay blacklist habilitado)
    try:
        refresh_token = request.COOKIES.get('refresh_token')
        if refresh_token and settings.SIMPLE_JWT.get('BLACKLIST_AFTER_ROTATION', False):
            token = RefreshToken(refresh_token)
            token.blacklist()
    except Exception:
        pass

    # Eliminar cookies JWT
    response.delete_cookie(
        'access_token',
        samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
    )
    response.delete_cookie(
        'refresh_token',
        samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
    )

    # Eliminar cookies de sesión de Django (Admin)
    response.delete_cookie('sessionid')
    response.delete_cookie('csrftoken')
    
    # Cerrar sesión de Django (limpia la sesión del lado del servidor)
    from django.contrib.auth import logout
    logout(request)
    
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token_view(request):
    """
    Refresca el access token usando el refresh token de la cookie
    """
    refresh_token = request.COOKIES.get('refresh_token')
    
    if not refresh_token:
        return Response(
            {'error': 'No se encontró refresh token'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    try:
        refresh = RefreshToken(refresh_token)
        access_token = str(refresh.access_token)
        
        # Si ROTATE_REFRESH_TOKENS está activado, generar nuevo refresh token
        if settings.SIMPLE_JWT.get('ROTATE_REFRESH_TOKENS', False):
            refresh.set_jti()
            refresh.set_exp()
            new_refresh_token = str(refresh)
        else:
            new_refresh_token = refresh_token
        
        response = Response({
            'message': 'Token refrescado exitosamente'
        }, status=status.HTTP_200_OK)
        
        # Actualizar cookies
        response.set_cookie(
            key='access_token',
            value=access_token,
            httponly=True,
            secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
            samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
            max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
        )
        
        response.set_cookie(
            key='refresh_token',
            value=new_refresh_token,
            httponly=True,
            secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
            samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
            max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
        )
        
        return response
        
    except Exception as e:
        return Response(
            {'error': 'Token inválido o expirado'},
            status=status.HTTP_401_UNAUTHORIZED
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_auth_view(request):
    """
    Verifica si el usuario está autenticado
    """
    user = request.user
    
    # Get profile picture URL if exists
    profile_picture_url = None
    try:
        if hasattr(user, 'profile') and user.profile.profile_picture:
            profile_picture_url = request.build_absolute_uri(user.profile.profile_picture.url)
    except Exception:
        pass
    
    # Google OAuth info
    has_google = hasattr(user, 'google_profile')
    google_email = None
    if has_google:
        google_email = user.google_profile.google_email
    
    return Response({
        'authenticated': True,
        'id': user.id,
        'username': user.username,
        'user_id': user.id,
        'email': user.email,
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
        'profile_picture_url': profile_picture_url,
        'has_google': has_google,
        'google_email': google_email,
        'has_password': user.has_usable_password(),
    }, status=status.HTTP_200_OK)


