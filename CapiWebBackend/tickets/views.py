from django.shortcuts import render, redirect
from django.views.generic import TemplateView

class TicketIndexView(TemplateView):
    """
    Sirve la UI (template HTML) donde el JS consumirá la API.
    Requiere autenticación - redirige a login si no está autenticado.
    """
    template_name = "tickets_index.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        # URL base de la API — pruébala y cámbiala si tu API está en otra ruta
        ctx['api_url'] = "/api/tickets/"
        return ctx


class LoginView(TemplateView):
    """
    Vista de login
    """
    template_name = "login.html"


class RegisterView(TemplateView):
    """
    Vista de registro
    """
    template_name = "register.html"
