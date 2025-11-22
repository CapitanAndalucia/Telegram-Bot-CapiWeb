from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),  # 👈 aquí quedaría: mipagina.es/api/tickets/
    path("tickets/", include("tickets.urls")),  # UI (front) de tickets en /tickets/
    path("portafolio/", include("portafolio.urls")),  # Portafolio en /portafolio/
    path("", include("core.urls")),   # 👈 Página inicial - DEBE ir al final
]+ static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)