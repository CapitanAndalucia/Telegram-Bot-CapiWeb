"""
Google OAuth Profile Model

Almacena la vinculación entre usuarios de Django y cuentas de Google.
Solo guarda el identificador único de Google (sub), nunca tokens sensibles.
"""
from django.db import models
from django.contrib.auth.models import User


class GoogleOAuthProfile(models.Model):
    """
    Perfil de OAuth de Google vinculado a un usuario.
    Almacena el identificador único de Google (sub) para autenticación.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='google_profile'
    )
    google_sub = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text="Identificador único del usuario en Google (sub claim)"
    )
    google_email = models.EmailField(
        help_text="Email de la cuenta de Google vinculada"
    )
    linked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Perfil OAuth de Google"
        verbose_name_plural = "Perfiles OAuth de Google"

    def __str__(self):
        return f"Google: {self.google_email} -> {self.user.username}"
