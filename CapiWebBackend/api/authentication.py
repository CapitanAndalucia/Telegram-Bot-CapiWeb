from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from django.conf import settings


class JWTCookieAuthentication(JWTAuthentication):
    """
    Autenticación JWT que lee el token desde cookies httponly
    """
    def authenticate(self, request):
        # Primero intentar obtener el token del header (para compatibilidad)
        header = self.get_header(request)
        
        if header is not None:
            raw_token = self.get_raw_token(header)
        else:
            # Si no hay header, intentar obtener de cookie
            cookie_name = settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')
            raw_token = request.COOKIES.get(cookie_name)
            
            if raw_token is None:
                return None
        
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
