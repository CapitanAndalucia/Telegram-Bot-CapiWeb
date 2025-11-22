from django.http import HttpResponseRedirect

from api.authentication import JWTCookieAuthentication


class ApiLoginRedirectMiddleware:
    """
    Redirige a /api/login/ cuando se accede a rutas HTML bajo /api/ sin JWT válido.
    No afecta a endpoints de autenticación ni peticiones no-HTML.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.auth = JWTCookieAuthentication()

    def __call__(self, request):
        path = request.path

        if path.startswith('/api/') and path not in (
            '/api/login/',
            '/api/auth/login/',
            '/api/auth/register/',
            '/api/auth/refresh/',
            '/api/auth/check/',
        ):
            # Consideramos redirigir sólo para navegadores (HTML)
            accept = request.META.get('HTTP_ACCEPT', '')
            wants_html = 'text/html' in accept

            if wants_html:
                user_auth = None
                try:
                    user_auth = self.auth.authenticate(request)
                except Exception:
                    user_auth = None

                if not user_auth:
                    return HttpResponseRedirect('/api/login/')

        return self.get_response(request)


