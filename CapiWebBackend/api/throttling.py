"""
Custom throttling classes for diferentiated rate limiting.
"""
from rest_framework.throttling import UserRateThrottle


class StaffUserRateThrottle(UserRateThrottle):
    """
    Throttle que permite más peticiones a usuarios staff y superusuarios.
    
    - Usuarios staff (is_staff=True) o superusuarios (is_superuser=True): 500 peticiones/min
    - Usuarios normales: 200 peticiones/min
    """
    
    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            # Use different scopes for staff/superuser/fileshare users vs regular users
            # Import here to avoid potential circular imports if transfers imports api
            from transfers.permissions import has_fileshare_permission
            
            if has_fileshare_permission(request.user):
                self.scope = 'staff'
            else:
                self.scope = 'user'
            
            # Get the rate for the current scope
            self.rate = self.get_rate()
            self.num_requests, self.duration = self.parse_rate(self.rate)
            
            ident = request.user.pk
        else:
            return None  # Anon users handled by AnonRateThrottle
        
        return self.cache_format % {
            'scope': self.scope,
            'ident': ident
        }

