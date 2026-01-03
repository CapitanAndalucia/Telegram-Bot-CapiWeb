"""
Google OAuth 2.0 Authentication Views

Flujos soportados:
1. Login con Google (usuario ya vinculado)
2. Registro con Google (usuario nuevo, requiere elegir username)
3. Vincular cuenta existente con Google
4. Desvincular cuenta de Google

SEGURIDAD:
- El authorization code se intercambia por ID token server-side
- El ID token se valida con las claves públicas de Google
- Nunca se exponen tokens sensibles al frontend
- El Client Secret permanece en el servidor
- Tokens temporales firmados para evitar doble autenticación
"""
import logging
import json
import hmac
import hashlib
import base64
import time
import requests as http_requests
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from rest_framework_simplejwt.tokens import RefreshToken

try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False

from social.models import Profile
from social.google_auth import GoogleOAuthProfile

logger = logging.getLogger(__name__)

# Token temporal válido por 5 minutos
PENDING_TOKEN_EXPIRY = 300


def create_pending_token(google_sub: str, google_email: str) -> str:
    """
    Crea un token temporal firmado que contiene la info de Google.
    Esto permite completar la vinculación sin volver a autenticar con Google.
    """
    payload = {
        'sub': google_sub,
        'email': google_email,
        'exp': int(time.time()) + PENDING_TOKEN_EXPIRY
    }
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode()
    
    # Firmar con el SECRET_KEY de Django
    signature = hmac.new(
        settings.SECRET_KEY.encode(),
        payload_b64.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"{payload_b64}.{signature}"


def verify_pending_token(token: str) -> dict | None:
    """
    Verifica y decodifica un token temporal.
    Retorna los datos si es válido, None si no.
    """
    try:
        parts = token.split('.')
        if len(parts) != 2:
            return None
        
        payload_b64, signature = parts
        
        # Verificar firma
        expected_sig = hmac.new(
            settings.SECRET_KEY.encode(),
            payload_b64.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_sig):
            logger.warning("Invalid pending token signature")
            return None
        
        # Decodificar payload
        payload_json = base64.urlsafe_b64decode(payload_b64).decode()
        payload = json.loads(payload_json)
        
        # Verificar expiración
        if payload.get('exp', 0) < time.time():
            logger.warning("Pending token expired")
            return None
        
        return payload
    except Exception as e:
        logger.warning(f"Error verifying pending token: {e}")
        return None


def verify_google_token(code: str) -> dict | None:
    """
    Intercambia el authorization code por un ID token y lo valida.
    
    Este proceso ocurre completamente en el servidor:
    1. Enviamos el code + client_secret a Google
    2. Google nos devuelve el ID token firmado
    3. Validamos la firma con las claves públicas de Google
    
    Retorna los claims del token si es válido, None si hay error.
    """
    if not GOOGLE_AUTH_AVAILABLE:
        logger.error("google-auth library not installed")
        return None
    
    try:
        # Intercambiar code por tokens (server-side, seguro)
        token_response = http_requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': settings.GOOGLE_CLIENT_ID,
                'client_secret': settings.GOOGLE_CLIENT_SECRET,
                'redirect_uri': 'postmessage',  # Para flujo popup desde JS
                'grant_type': 'authorization_code',
            },
            timeout=10
        )
        
        if token_response.status_code != 200:
            logger.warning(f"Google token exchange failed: {token_response.text}")
            return None
        
        tokens = token_response.json()
        id_token_jwt = tokens.get('id_token')
        
        if not id_token_jwt:
            logger.warning("No id_token in Google response")
            return None
        
        # Validar el ID token con las claves públicas de Google
        # Esto verifica la firma criptográfica del token
        idinfo = id_token.verify_oauth2_token(
            id_token_jwt,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
        
        # Verificar que el token sea para nuestra app
        if idinfo['aud'] != settings.GOOGLE_CLIENT_ID:
            logger.warning("Token audience mismatch")
            return None
        
        return idinfo
        
    except Exception as e:
        logger.exception(f"Error verifying Google token: {e}")
        return None


def create_jwt_response(user: User, response: Response) -> Response:
    """Crea tokens JWT propios y los establece en cookies httponly."""
    refresh = RefreshToken.for_user(user)
    access_token = str(refresh.access_token)
    refresh_token = str(refresh)
    
    response.set_cookie(
        key=settings.SIMPLE_JWT['AUTH_COOKIE'],
        value=access_token,
        httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
        secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
        samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
        max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
    )
    response.set_cookie(
        key=settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'],
        value=refresh_token,
        httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
        secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
        samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
    )
    
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def google_auth_view(request):
    """
    Endpoint principal para autenticación con Google.
    
    Flujos:
    1. Usuario con google_sub vinculado -> Login directo
    2. Usuario con mismo email (sin vincular) -> Retorna 'link_required' + pending_token
    3. Usuario nuevo -> Retorna 'username_required' + pending_token
    4. Si se proporciona username + pending_token -> Crea usuario nuevo
    5. Si se proporciona confirm_link=True + pending_token -> Vincula cuenta existente
    
    POST /api/auth/google/
    {
        "code": "authorization_code_from_google",  // Primera vez
        "pending_token": "token_temporal",  // Para confirmar sin re-autenticar
        "username": "nuevo_usuario",  // Solo para registro nuevo
        "confirm_link": true  // Solo para vincular cuenta existente
    }
    """
    if not settings.GOOGLE_OAUTH_ENABLED:
        return Response(
            {'error': 'Google OAuth no está configurado en el servidor'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    
    if not GOOGLE_AUTH_AVAILABLE:
        return Response(
            {'error': 'Dependencias de Google Auth no instaladas'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    
    code = request.data.get('code')
    pending_token = request.data.get('pending_token')
    username = request.data.get('username')
    confirm_link = request.data.get('confirm_link', False)
    
    google_sub = None
    google_email = ''
    
    # Opción 1: Usar pending_token (para confirmaciones sin re-autenticar)
    if pending_token:
        token_data = verify_pending_token(pending_token)
        if not token_data:
            return Response(
                {'error': 'Token pendiente inválido o expirado. Por favor, intenta de nuevo.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        google_sub = token_data['sub']
        google_email = token_data.get('email', '')
    
    # Opción 2: Usar code (primera autenticación)
    elif code:
        google_info = verify_google_token(code)
        if not google_info:
            return Response(
                {'error': 'Token de Google inválido o expirado'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        google_sub = google_info['sub']
        google_email = google_info.get('email', '')
    
    else:
        return Response(
            {'error': 'Se requiere código de autorización o token pendiente'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Caso 1: Usuario ya tiene cuenta vinculada con Google -> Login directo
    try:
        google_profile = GoogleOAuthProfile.objects.select_related('user').get(google_sub=google_sub)
        response = Response({
            'message': 'Login exitoso con Google',
            'user': {
                'id': google_profile.user.id,
                'username': google_profile.user.username,
                'email': google_profile.user.email,
            }
        })
        return create_jwt_response(google_profile.user, response)
    except GoogleOAuthProfile.DoesNotExist:
        pass
    
    # Caso 2: Existe usuario con el mismo email -> Solicitar vinculación
    if google_email:
        try:
            existing_user = User.objects.get(email=google_email)
            
            # Si el usuario confirma la vinculación
            if confirm_link:
                with transaction.atomic():
                    GoogleOAuthProfile.objects.create(
                        user=existing_user,
                        google_sub=google_sub,
                        google_email=google_email
                    )
                response = Response({
                    'message': 'Cuenta vinculada exitosamente con Google',
                    'user': {
                        'id': existing_user.id,
                        'username': existing_user.username,
                        'email': existing_user.email,
                    }
                })
                return create_jwt_response(existing_user, response)
            
            # Solicitar confirmación al usuario (con token para no re-autenticar)
            return Response({
                'status': 'link_required',
                'message': 'Ya existe una cuenta con este email. ¿Deseas vincularla con Google?',
                'existing_username': existing_user.username,
                'google_email': google_email,
                'pending_token': create_pending_token(google_sub, google_email),
            }, status=status.HTTP_200_OK)
            
        except User.DoesNotExist:
            pass
    
    # Caso 3: Usuario nuevo - necesita elegir username
    if not username:
        suggested = google_email.split('@')[0] if google_email else ''
        # Asegurar que el username sugerido no exista
        if suggested and User.objects.filter(username=suggested).exists():
            suggested = f"{suggested}_{google_sub[:4]}"
        
        return Response({
            'status': 'username_required',
            'message': 'Elige un nombre de usuario para tu nueva cuenta',
            'google_email': google_email,
            'suggested_username': suggested,
            'pending_token': create_pending_token(google_sub, google_email),
        }, status=status.HTTP_200_OK)
    
    # Validar username
    username = username.strip()
    if len(username) < 3:
        return Response(
            {'error': 'El nombre de usuario debe tener al menos 3 caracteres'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if len(username) > 30:
        return Response(
            {'error': 'El nombre de usuario no puede tener más de 30 caracteres'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if User.objects.filter(username=username).exists():
        return Response(
            {'error': 'Este nombre de usuario ya está en uso'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Crear nuevo usuario
    with transaction.atomic():
        user = User.objects.create_user(
            username=username,
            email=google_email,
            password=None  # Sin contraseña (solo login con Google por ahora)
        )
        # El Profile se crea automáticamente por el signal en social/models.py
        
        GoogleOAuthProfile.objects.create(
            user=user,
            google_sub=google_sub,
            google_email=google_email
        )
    
    response = Response({
        'message': 'Cuenta creada exitosamente con Google',
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
        }
    }, status=status.HTTP_201_CREATED)
    return create_jwt_response(user, response)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def google_link_view(request):
    """
    Vincular cuenta de Google a usuario autenticado.
    Útil para usuarios que se registraron con contraseña y luego quieren
    añadir la opción de login con Google.
    
    POST /api/auth/google/link/
    { "code": "authorization_code_from_google" }
    """
    if not settings.GOOGLE_OAUTH_ENABLED:
        return Response(
            {'error': 'Google OAuth no está configurado'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    
    user = request.user
    
    # Verificar que no tenga ya una cuenta de Google vinculada
    if hasattr(user, 'google_profile'):
        return Response(
            {'error': 'Ya tienes una cuenta de Google vinculada'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    code = request.data.get('code')
    if not code:
        return Response(
            {'error': 'Se requiere el código de autorización de Google'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    google_info = verify_google_token(code)
    if not google_info:
        return Response(
            {'error': 'Token de Google inválido o expirado'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    google_sub = google_info['sub']
    google_email = google_info.get('email', '')
    
    # Verificar que esta cuenta de Google no esté vinculada a otro usuario
    if GoogleOAuthProfile.objects.filter(google_sub=google_sub).exists():
        return Response(
            {'error': 'Esta cuenta de Google ya está vinculada a otro usuario'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Vincular
    GoogleOAuthProfile.objects.create(
        user=user,
        google_sub=google_sub,
        google_email=google_email
    )
    
    # Actualizar email del usuario si no tiene
    if not user.email and google_email:
        user.email = google_email
        user.save(update_fields=['email'])
    
    return Response({
        'message': 'Cuenta de Google vinculada exitosamente',
        'google_email': google_email,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def google_unlink_view(request):
    """
    Desvincular cuenta de Google del usuario autenticado.
    Solo permitido si el usuario tiene contraseña establecida
    (para no quedarse sin forma de acceder a la cuenta).
    
    POST /api/auth/google/unlink/
    """
    user = request.user
    
    # Verificar que tenga cuenta de Google vinculada
    if not hasattr(user, 'google_profile'):
        return Response(
            {'error': 'No tienes ninguna cuenta de Google vinculada'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Verificar que tenga contraseña establecida
    if not user.has_usable_password():
        return Response(
            {'error': 'Debes establecer una contraseña antes de desvincular tu cuenta de Google'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Desvincular
    user.google_profile.delete()
    
    return Response({
        'message': 'Cuenta de Google desvinculada exitosamente'
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def google_config_view(request):
    """
    Retorna la configuración pública de Google OAuth.
    El frontend usa esto para inicializar el SDK de Google.
    
    GET /api/auth/google/config/
    
    Nota: Solo se expone el client_id (público), nunca el client_secret.
    """
    return Response({
        'enabled': settings.GOOGLE_OAUTH_ENABLED,
        'client_id': settings.GOOGLE_CLIENT_ID if settings.GOOGLE_OAUTH_ENABLED else None,
    })
