from rest_framework import permissions

def has_fileshare_permission(user):
    """
    Check if user has permission to upload/manage files in fileshare.
    Allowed users:
    - Superusers
    - Staff
    - Members of 'fileshareGROUP'
    """
    if not user.is_authenticated:
        return False
        
    if user.is_superuser or user.is_staff:
        return True
        
    return user.groups.filter(name='fileshareGROUP').exists()

class IsFileshareUser(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit it.
    """

    def has_permission(self, request, view):
        return has_fileshare_permission(request.user)
