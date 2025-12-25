"""
Django Production Settings
Hereda de base.py y añade configuraciones específicas de producción.
La variable ENVIRONMENT=production debe estar definida en .env
"""
from .base import *

# =============================================================================
# PRODUCTION DATABASE
# =============================================================================
# En producción usamos PostgreSQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': env('POSTGRES_DB'),
        'USER': env('POSTGRES_USER'),
        'PASSWORD': env('POSTGRES_PASSWORD'),
        'HOST': env('POSTGRES_HOST', default='localhost'),
        'PORT': env('POSTGRES_PORT', default='5432'),
    }
}

# =============================================================================
# PRODUCTION-SPECIFIC SETTINGS
# =============================================================================
# Logging mejorado para producción
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'WARNING',
            'class': 'logging.FileHandler',
            'filename': PROJECT_ROOT_DIR / 'logs' / 'django.log',
            'formatter': 'verbose',
        },
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}

# Caches con Redis (opcional, descomentar si usas Redis)
# CACHES = {
#     'default': {
#         'BACKEND': 'django.core.cache.backends.redis.RedisCache',
#         'LOCATION': env('REDIS_URL', default='redis://127.0.0.1:6379/1'),
#     }
# }
