from django.urls import path
from .views import TicketIndexView, LoginView, RegisterView

urlpatterns = [
    # Páginas
    path("", TicketIndexView.as_view(), name="tickets_index"),
    path("login/", LoginView.as_view(), name="auth_login_page"),
    path("register/", RegisterView.as_view(), name="auth_register_page"),
]