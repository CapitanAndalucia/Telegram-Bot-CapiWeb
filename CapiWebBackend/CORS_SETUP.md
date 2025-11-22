# Configuración CORS

## ¿Qué es CORS?

CORS (Cross-Origin Resource Sharing) es un mecanismo de seguridad del navegador que controla qué orígenes pueden acceder a recursos de tu API.

## Problema

Cuando el frontend React (http://localhost:5173) intenta hacer peticiones al backend Django (http://localhost:8000), el navegador bloquea estas peticiones por política de seguridad, ya que son orígenes diferentes.

## Solución Implementada

### 1. Instalación de django-cors-headers

```bash
pip install django-cors-headers
```

### 2. Configuración en settings/base.py

**INSTALLED_APPS:**
```python
INSTALLED_APPS = [
    # ...
    "corsheaders",  # CORS support
    # ...
]
```

**MIDDLEWARE (importante el orden):**
```python
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'axes.middleware.AxesMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # ⚠️ Debe ir ANTES de CommonMiddleware
    'django.contrib.sessions.middleware.SessionMiddleware',
    # ...
]
```

**Configuración CORS:**
```python
# CORS Configuration
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]
```

## Verificación

Después de aplicar estos cambios:

1. **Reinicia el servidor Django:**
   ```bash
   cd CapiWebBackend
   source botTelegram/bin/activate
   python manage.py runserver
   ```

2. **Verifica en el navegador:**
   - Abre las DevTools (F12)
   - Ve a la pestaña Network
   - Intenta hacer login
   - Deberías ver que las peticiones ahora tienen los headers CORS correctos

## Producción

⚠️ **IMPORTANTE:** En producción, cambia `CORS_ALLOWED_ORIGINS` para incluir solo tu dominio real:

```python
CORS_ALLOWED_ORIGINS = [
    "https://tudominio.com",
    "https://www.tudominio.com",
]
```

**NUNCA uses:**
```python
CORS_ALLOW_ALL_ORIGINS = True  # ❌ Inseguro para producción
```

## Troubleshooting

### El error persiste después de los cambios

1. Asegúrate de haber reiniciado el servidor Django
2. Limpia la caché del navegador (Ctrl + Shift + Delete)
3. Verifica que `django-cors-headers` esté instalado:
   ```bash
   pip list | grep cors
   ```

### Errores con cookies/credenciales

Si usas cookies (como JWT en cookies), asegúrate de:
- `CORS_ALLOW_CREDENTIALS = True` en Django
- `credentials: 'include'` en las peticiones fetch del frontend

### Preflight requests fallan

Los navegadores envían una petición OPTIONS antes de POST/PUT/DELETE. Django debe responder correctamente a estas peticiones. El middleware de CORS se encarga de esto automáticamente.
