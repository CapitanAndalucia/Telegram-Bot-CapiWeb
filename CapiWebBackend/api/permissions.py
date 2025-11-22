from rest_framework.permissions import BasePermission

class IsAdminOrStaff(BasePermission):
    """
    Permiso personalizado que permite acceso a usuarios admin o staff.
    """
    def has_permission(self, request, view):
        return request.user and (request.user.is_staff or request.user.is_superuser)

class IsOwnerOrAdmin(BasePermission):
    """
    Permiso que permite acceso al propietario del recurso o a un admin.
    """
    def has_object_permission(self, request, view, obj):
        # Admin puede acceder a todo
        if request.user.is_staff or request.user.is_superuser:
            return True
        # El usuario solo puede acceder a sus propios datos
        return obj == request.user or (hasattr(obj, 'user') and obj.user == request.user)

from rest_framework.permissions import SAFE_METHODS

class IsAdminOrReadOnly(BasePermission):
    """
    Permite lectura a cualquiera (o autenticados segun configuracion global),
    pero escritura solo a admins.
    """
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user and (request.user.is_staff or request.user.is_superuser)

