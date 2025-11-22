from django.shortcuts import render
from django.views.generic import TemplateView
from api.models import PortfolioPhoto

class CurriculumView(TemplateView):
    """
    Vista del portafolio personal.
    """
    template_name = "portafolio/curriculum.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        foto = PortfolioPhoto.objects.first()  # solo hay una
        ctx["foto_url"] = foto.foto.url if foto and foto.foto else None
        return ctx
    
class ViceCityPortfolioView(TemplateView):
    """
    Vista del portafolio personal.
    """
    template_name = "portafolio/vice_city_portfolio.html"
