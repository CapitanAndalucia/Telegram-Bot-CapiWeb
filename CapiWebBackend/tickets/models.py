from django.db import models
from django.contrib.auth.models import User

class TelegramProfile(models.Model):
    """
    Modelo para vincular usuarios de Django con IDs de Telegram.
    Permite que el bot de Telegram cree tickets para usuarios específicos.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='telegram_profile',
        verbose_name='Usuario'
    )
    telegram_id = models.BigIntegerField(
        unique=True,
        null=True,
        blank=True,
        verbose_name='ID de Telegram',
        help_text='ID único del usuario en Telegram'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Fecha de creación')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Última actualización')
    
    class Meta:
        verbose_name = 'Perfil de Telegram'
        verbose_name_plural = 'Perfiles de Telegram'
        ordering = ['user__username']
    
    def __str__(self):
        telegram_status = f"(TG: {self.telegram_id})" if self.telegram_id else "(Sin TG)"
        return f"{self.user.username} {telegram_status}"
    
    @property
    def has_telegram(self):
        """Retorna True si el usuario tiene un ID de Telegram configurado"""
        return self.telegram_id is not None
