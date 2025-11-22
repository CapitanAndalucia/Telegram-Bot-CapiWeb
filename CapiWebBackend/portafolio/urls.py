from django.urls import path
from . import views

app_name = 'portafolio'

urlpatterns = [
    path('curriculum/', views.CurriculumView.as_view(), name='curriculum'),
    path('portfolio_arte/', views.ViceCityPortfolioView.as_view(), name='portfolio_arte'),
]
