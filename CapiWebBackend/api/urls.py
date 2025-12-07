# api/urls.py
from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    DibujosViewSet, 
    TicketViewSet, 
    PortfolioPhotoViewSet, 
    api_login_page,
    get_telegram_id_by_username,
    UserDetailView,
    TelegramProfileListView,
    ProyectoViewSet,
    TecnologiaViewSet
)
from .auth_views import (
    register_view,
    login_view,
    logout_view,
    refresh_token_view,
    check_auth_view
)

from social.views import FriendViewSet
from transfers.views import FileTransferViewSet, FolderViewSet
from notifications.views import NotificationViewSet

router = DefaultRouter()
router.register(r'tickets', TicketViewSet, basename='ticket')
router.register(r'portfolio-photos', PortfolioPhotoViewSet, basename='portfolio-photo')
router.register(r'dibujos', DibujosViewSet, basename='dibujos')
router.register(r'friends', FriendViewSet, basename='friend')
router.register(r'transfers', FileTransferViewSet, basename='transfer')
router.register(r'folders', FolderViewSet, basename='folder')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'tecnologias', TecnologiaViewSet, basename='tecnologia')
router.register('proyectos', ProyectoViewSet, basename='proyecto')


urlpatterns = [
    # Página HTML de login para la API
    path("login/", api_login_page, name="api_login_page"),
    # API de autenticación
    path("auth/register/", register_view, name="api_auth_register"),
    path("auth/login/", login_view, name="api_auth_login"),
    path("auth/logout/", logout_view, name="api_auth_logout"),
    path("auth/refresh/", refresh_token_view, name="api_auth_refresh"),
    path("auth/check/", check_auth_view, name="api_auth_check"),
    # API de Telegram
    path("telegram/user/", get_telegram_id_by_username, name="telegram_user_by_username"),
    path("telegram/profiles/", TelegramProfileListView.as_view(), name="telegram_profiles"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user_detail"),
] + router.urls