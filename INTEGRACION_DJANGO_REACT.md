# Integración Django + React

Este documento explica cómo integrar la aplicación React con el backend Django.

## 📋 Estructura del Proyecto

```
BotTelegram/
├── BotTelegram/              # Aplicación React (Frontend)
│   ├── src/
│   │   ├── pages/           # Páginas de la aplicación
│   │   ├── components/      # Componentes reutilizables
│   │   ├── context/         # Contextos (Auth, etc.)
│   │   ├── services/        # Servicios API
│   │   └── App.jsx
│   ├── .env                 # Variables de entorno
│   └── package.json
│
└── CapiWebBackend/          # Aplicación Django (Backend)
    ├── api/                 # API REST
    ├── tickets/             # App de tickets
    ├── portafolio/          # App de portfolio
    ├── core/                # App core
    └── manage.py
```

## 🔧 Configuración del Backend (Django)

### 1. Instalar dependencias necesarias

```bash
cd CapiWebBackend
source botTelegram/bin/activate  # Activar entorno virtual
pip install django-cors-headers djangorestframework djangorestframework-simplejwt
```

### 2. Configurar CORS en Django

Edita `CapiWebBackend/config/settings.py`:

```python
INSTALLED_APPS = [
    # ... otras apps
    'corsheaders',
    'rest_framework',
    'rest_framework.authtoken',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Debe estar al principio
    'django.middleware.common.CommonMiddleware',
    # ... otros middlewares
]

# Configuración de CORS
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # React dev server
    "http://127.0.0.1:5173",
]

CORS_ALLOW_CREDENTIALS = True

# Configuración de REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
}
```

### 3. Configurar URLs de la API

Asegúrate de que las URLs de la API estén correctamente configuradas en `CapiWebBackend/config/urls.py`:

```python
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),  # API endpoints
    path('api/tickets/', include('tickets.urls')),
    path('api/portfolio/', include('portafolio.urls')),
    # ... otras URLs
]
```

### 4. Crear endpoints de autenticación

En `CapiWebBackend/api/views.py`:

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    email = request.data.get('email')
    password = request.data.get('password')
    
    # Buscar usuario por email
    try:
        user = User.objects.get(email=email)
        user = authenticate(username=user.username, password=password)
    except User.DoesNotExist:
        return Response({'error': 'Credenciales inválidas'}, status=401)
    
    if user:
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
            }
        })
    
    return Response({'error': 'Credenciales inválidas'}, status=401)

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')
    telegram_id = request.data.get('telegram_id')
    
    if User.objects.filter(username=username).exists():
        return Response({'error': 'El usuario ya existe'}, status=400)
    
    if User.objects.filter(email=email).exists():
        return Response({'error': 'El email ya está registrado'}, status=400)
    
    user = User.objects.create_user(username=username, email=email, password=password)
    
    # Guardar telegram_id si se proporciona
    if telegram_id:
        user.profile.telegram_id = telegram_id
        user.profile.save()
    
    token, _ = Token.objects.get_or_create(user=user)
    
    return Response({
        'token': token.key,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
        }
    }, status=201)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    request.user.auth_token.delete()
    return Response({'message': 'Sesión cerrada correctamente'})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_auth(request):
    return Response({
        'username': request.user.username,
        'email': request.user.email,
        'user_id': request.user.id,
    })
```

En `CapiWebBackend/api/urls.py`:

```python
from django.urls import path
from . import views

urlpatterns = [
    path('auth/login/', views.login, name='api_login'),
    path('auth/register/', views.register, name='api_register'),
    path('auth/logout/', views.logout, name='api_logout'),
    path('auth/check/', views.check_auth, name='api_check_auth'),
]
```

## 🚀 Configuración del Frontend (React)

### 1. Instalar dependencias

```bash
cd BotTelegram
npm install
```

### 2. Configurar variables de entorno

Crea o edita el archivo `.env`:

```
VITE_API_URL=http://localhost:8000/api
VITE_APP_NAME=Mi Plataforma
```

### 3. Iniciar el servidor de desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 🔄 Flujo de Autenticación

1. **Login:**
   - Usuario ingresa email y contraseña en React
   - React envía POST a `/api/auth/login/`
   - Django valida y devuelve token + datos de usuario
   - React guarda token en localStorage
   - Token se envía en cada petición mediante header `Authorization: Bearer <token>`

2. **Registro:**
   - Usuario completa formulario de registro
   - React envía POST a `/api/auth/register/`
   - Django crea usuario y devuelve token
   - React guarda token y redirige al dashboard

3. **Verificación:**
   - Al cargar la app, React verifica si hay token
   - Envía GET a `/api/auth/check/`
   - Si es válido, mantiene sesión; si no, redirige a login

4. **Logout:**
   - Usuario hace click en cerrar sesión
   - React envía POST a `/api/auth/logout/`
   - Django elimina el token
   - React limpia localStorage y redirige a login

## 📡 Endpoints de la API

### Autenticación
- `POST /api/auth/login/` - Iniciar sesión
- `POST /api/auth/register/` - Registrar usuario
- `POST /api/auth/logout/` - Cerrar sesión
- `GET /api/auth/check/` - Verificar autenticación

### Tickets
- `GET /api/tickets/` - Listar tickets (paginado)
- `POST /api/tickets/` - Crear ticket
- `GET /api/tickets/:id/` - Obtener ticket
- `PUT /api/tickets/:id/` - Actualizar ticket
- `DELETE /api/tickets/:id/` - Eliminar ticket

### Usuarios
- `GET /api/users/:id/` - Obtener usuario
- `PATCH /api/users/:id/` - Actualizar usuario

### Portfolio
- `GET /api/portfolio/curriculum/` - Obtener curriculum
- `GET /api/portfolio/art/` - Obtener portfolio de arte

### 🤖 Integración con Telegram Bot
El proyecto incluye un bot de Telegram que consume la misma API de Django:
- **Autenticación:** Usa el token de sesión del admin para realizar operaciones.
- **Endpoints:**
  - `GET /api/tickets/total_entre_fechas/` - Consulta de gastos
  - `POST /api/tickets/` - Creación de tickets desde el bot
  - `GET /api/telegram/profiles/` - Verificación de usuarios autorizados


## 🐛 Solución de Problemas

### Error de CORS

**Síntoma:** Errores de CORS en la consola del navegador

**Solución:**
1. Verifica que `django-cors-headers` esté instalado
2. Asegúrate de que `corsheaders` esté en `INSTALLED_APPS`
3. Verifica que `CorsMiddleware` esté al principio de `MIDDLEWARE`
4. Confirma que `http://localhost:5173` esté en `CORS_ALLOWED_ORIGINS`

### Error 401 en todas las peticiones

**Síntoma:** Todas las peticiones devuelven 401 Unauthorized

**Solución:**
1. Verifica que el token se esté guardando en localStorage
2. Confirma que el token se envíe en el header `Authorization`
3. Verifica que el usuario esté autenticado en Django
4. Revisa la configuración de `REST_FRAMEWORK` en settings.py

### El proxy no funciona

**Síntoma:** Las peticiones no llegan al backend

**Solución:**
1. Verifica que el backend esté corriendo en `http://localhost:8000`
2. Revisa la configuración del proxy en `vite.config.js`
3. Reinicia el servidor de desarrollo de React

### Estilos no se cargan

**Síntoma:** Las páginas no tienen estilos

**Solución:**
1. Verifica que los archivos CSS estén importados en los componentes
2. Asegúrate de que las rutas de los archivos CSS sean correctas
3. Reinicia el servidor de desarrollo

## 📝 Comandos Útiles

### Backend (Django)
```bash
# Activar entorno virtual
source botTelegram/bin/activate

# Iniciar servidor
python manage.py runserver

# Crear migraciones
python manage.py makemigrations

# Aplicar migraciones
python manage.py migrate

# Crear superusuario
python manage.py createsuperuser
```

### Frontend (React)
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Build para producción
npm run build

# Previsualizar build
npm run preview

# Linter
npm run lint
```

## 🚀 Despliegue

### Backend (Django)
1. Configura las variables de entorno de producción
2. Actualiza `ALLOWED_HOSTS` en settings.py
3. Configura `CORS_ALLOWED_ORIGINS` con la URL de producción
4. Usa un servidor WSGI como Gunicorn
5. Configura un servidor web como Nginx

### Frontend (React)
1. Actualiza `VITE_API_URL` con la URL de producción
2. Ejecuta `npm run build`
3. Despliega la carpeta `dist/` en:
   - Vercel (recomendado)
   - Netlify
   - GitHub Pages
   - Cualquier servidor web estático

## 📚 Recursos Adicionales

- [Documentación de Django REST Framework](https://www.django-rest-framework.org/)
- [Documentación de React Router](https://reactrouter.com/)
- [Documentación de Material-UI](https://mui.com/)
- [Documentación de Vite](https://vitejs.dev/)
- [Documentación de Axios](https://axios-http.com/)

---

**Nota:** Este documento asume que tienes conocimientos básicos de Django y React. Si encuentras algún problema, revisa los logs del servidor y la consola del navegador para más detalles.
