from rest_framework.throttling import BaseThrottle
from django.core.cache import cache
from time import time


def _get_ident_from_request(request):
    """Obtener IP cliente desde headers o REMOTE_ADDR."""
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR') or 'unknown'


class RegisterThrottle(BaseThrottle):
    """
    Throttle para registro: máximo 5 registros por IP cada 10 minutos (600s).
    Implementación basada en timestamps en cache.
    """
    rate = 5
    period = 10 * 60  # segundos

    def allow_request(self, request, view):
        ident = _get_ident_from_request(request)
        cache_key = f"register_throttle_{ident}"
        now = int(time())
        history = cache.get(cache_key, []) or []

        # mantener solo timestamps dentro del periodo
        history = [ts for ts in history if now - ts < self.period]

        if len(history) >= self.rate:
            # registrar tiempo de espera para mensaje opcional
            self.wait_time = self.period - (now - history[0])
            return False

        # aceptar y guardar timestamp
        history.append(now)
        cache.set(cache_key, history, timeout=self.period)
        return True

    def wait(self):
        return getattr(self, 'wait_time', None)
