# tickets/api_urls.py
from rest_framework.routers import DefaultRouter
from .views import TicketViewSet
from .views import TicketViewSet, PortfolioPhotoViewSet

router = DefaultRouter()
router.register(r'tickets', TicketViewSet, basename="tickets")
router.register(r"portfolio-photo", PortfolioPhotoViewSet, basename="portfolio-photo")

urlpatterns = router.urls
