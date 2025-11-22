from django.db import models
from datetime import date
from django.contrib.auth.models import User

class Ticket(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tickets')
    titulo = models.CharField(max_length=255)
    fecha = models.DateTimeField()
    coste = models.DecimalField(max_digits=10, decimal_places=2)  # ejemplo: 12345.67
    moneda = models.CharField(max_length=3, default="EUR")  # EUR, USD, etc.

    def __str__(self):
        return f"{self.titulo} - {self.coste}{self.moneda}"


class PortfolioPhoto(models.Model):
    """
    Imagen principal del portafolio personal.
    """
    foto = models.ImageField(upload_to="portfolio_photos/")

    def __str__(self):
        return f"Foto {self.id}"
    

class Dibujos(models.Model):
    descripcion = models.TextField()
    imagen = models.ImageField(upload_to='drawings/')
    palabras_clave = models.CharField(max_length=255, blank=True, null=True)
    fecha_creacion = models.DateField(default=date.today)
    pin = models.BooleanField(default=False)

    def __str__(self):
        return self.descripcion[:50]