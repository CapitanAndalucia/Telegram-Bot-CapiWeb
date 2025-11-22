# Sistema de Autenticación JWT para Tickets

## ✅ Implementación Completada

Se ha implementado un sistema completo de autenticación JWT con las siguientes características:

### 🔐 Características Implementadas

1. **Autenticación JWT con HttpOnly Cookies**
   - Access token (60 minutos de duración)
   - Refresh token (7 días de duración)
   - Tokens almacenados en cookies httponly para mayor seguridad
   - Rotación automática de refresh tokens

2. **Páginas de Autenticación**
   - `/tickets/login/` - Página de inicio de sesión
   - `/tickets/register/` - Página de registro de usuarios
   - Diseño moderno y responsive

3. **Endpoints de API**
   - `POST /tickets/api/auth/register/` - Registro de usuario
   - `POST /tickets/api/auth/login/` - Inicio de sesión
   - `POST /tickets/api/auth/logout/` - Cerrar sesión
   - `POST /tickets/api/auth/refresh/` - Refrescar token
   - `GET /tickets/api/auth/check/` - Verificar autenticación

4. **Protección de Tickets**
   - Los tickets ahora están asociados a usuarios
   - Solo se muestran los tickets del usuario autenticado
   - El campo `usuario_nombre` se devuelve en lugar del ID
   - Redirección automática a login si no está autenticado

5. **Seguridad**
   - Cookies httponly (no accesibles desde JavaScript)
   - CSRF protection habilitado
   - Configuración diferenciada para desarrollo/producción

### 🚀 Cómo Usar

#### 1. Iniciar el Servidor
```bash
source botTelegram/bin/activate
python manage.py runserver
```

#### 2. Acceder a la Aplicación
- Ir a: `http://localhost:8000/tickets/`
- Serás redirigido automáticamente a `/tickets/login/`

#### 3. Crear una Cuenta
- Click en "Regístrate aquí"
- Completa el formulario de registro
- Serás redirigido automáticamente a la página de tickets

#### 4. Iniciar Sesión
- Usuario de prueba ya creado:
  - **Usuario:** `admin`
  - **Contraseña:** `admin123`

#### 5. Usar la Aplicación
- Crear, editar y eliminar tickets
- Los tickets son privados para cada usuario
- Click en "Cerrar Sesión" para salir

### 📁 Archivos Modificados/Creados

#### Modelos
- `api/models.py` - Añadido campo `usuario` a Ticket

#### Vistas
- `tickets/auth_views.py` - Vistas de autenticación (login, register, logout, refresh)
- `tickets/views.py` - Vistas de páginas (LoginView, RegisterView)
- `api/views.py` - Actualizado TicketViewSet con filtrado por usuario

#### Autenticación
- `tickets/authentication.py` - Clase JWTCookieAuthentication personalizada

#### Templates
- `tickets/templates/login.html` - Página de login
- `tickets/templates/register.html` - Página de registro
- `tickets/templates/tickets_index.html` - Actualizado con botón de logout

#### JavaScript
- `tickets/static/tickets/js/script.js` - Añadidas funciones de autenticación

#### CSS
- `tickets/static/tickets/css/style.css` - Estilos para header y logout

#### Configuración
- `config/settings/base.py` - Configuración JWT y seguridad
- `config/settings/local.py` - Configuración para desarrollo local
- `tickets/urls.py` - URLs de autenticación
- `requirements.txt` - Añadido djangorestframework-simplejwt

#### Migraciones
- `api/migrations/0004_ticket_usuario.py` - Añadir campo usuario
- `api/migrations/0005_auto_20251006_1734.py` - Hacer campo usuario obligatorio

### ⚙️ Configuración de Seguridad

#### Desarrollo (local.py)
```python
SESSION_COOKIE_SECURE = False  # HTTP permitido
CSRF_COOKIE_SECURE = False
SIMPLE_JWT['AUTH_COOKIE_SECURE'] = False
```

#### Producción (base.py)
```python
SESSION_COOKIE_SECURE = True  # Solo HTTPS
CSRF_COOKIE_SECURE = True
SIMPLE_JWT['AUTH_COOKIE_SECURE'] = True
```

### 🔧 Configuración JWT

```python
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'AUTH_COOKIE': 'access_token',
    'AUTH_COOKIE_REFRESH': 'refresh_token',
    'AUTH_COOKIE_HTTP_ONLY': True,
    'AUTH_COOKIE_SAMESITE': 'Lax',
}
```

### 📝 Notas Importantes

1. **Tickets Existentes**: Los tickets existentes fueron asignados automáticamente al usuario `admin`

2. **Cookies HttpOnly**: Los tokens JWT se almacenan en cookies httponly, lo que significa que no son accesibles desde JavaScript del lado del cliente, aumentando la seguridad

3. **Refresh Token**: El sistema implementa refresh tokens para mantener la sesión activa sin requerir login frecuente

4. **CSRF Protection**: Todas las peticiones POST/PUT/DELETE requieren token CSRF

5. **Redirección Automática**: Si el usuario no está autenticado, será redirigido automáticamente a la página de login

### 🐛 Troubleshooting

#### Error: "No module named 'rest_framework_simplejwt'"
```bash
source botTelegram/bin/activate
pip install djangorestframework-simplejwt
```

#### Error: Cookies no funcionan
- Verificar que `SESSION_COOKIE_SECURE = False` en `local.py` para desarrollo
- Verificar que estás accediendo vía `localhost` o `127.0.0.1`

#### Error: 401 Unauthorized
- Verificar que el token no ha expirado
- Intentar hacer logout y login nuevamente
- Verificar que las cookies están habilitadas en el navegador

### 🎯 Próximos Pasos (Opcional)

- [ ] Implementar "Recordarme" para sesiones más largas
- [ ] Añadir recuperación de contraseña por email
- [ ] Implementar perfiles de usuario
- [ ] Añadir roles y permisos (admin, usuario normal)
- [ ] Implementar límite de intentos de login
- [ ] Añadir autenticación de dos factores (2FA)
