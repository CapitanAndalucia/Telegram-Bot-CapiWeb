# Configuración de Google OAuth 2.0

## 1. Crear Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Ve a **APIs & Services > Credentials**

## 2. Configurar Pantalla de Consentimiento

1. Ve a **OAuth consent screen**
2. Selecciona **External** (para usuarios fuera de tu organización)
3. Completa los campos requeridos:
   - **App name:** `CapiWeb`
   - **User support email:** tu email
   - **Developer contact:** tu email
4. En **Scopes**, añade:
   - `email`
   - `profile`
   - `openid`
5. Guarda y continúa

## 3. Crear Credenciales OAuth 2.0

1. Ve a **Credentials > Create Credentials > OAuth client ID**
2. Selecciona **Web application**
3. Configura:
   - **Name:** `CapiWeb Web Client`
   - **Authorized JavaScript origins:**
     - `http://localhost:4200` (desarrollo)
     - `https://tu-dominio.com` (producción)
   - **Authorized redirect URIs:**
     - `http://localhost:4200` (desarrollo)
     - `https://tu-dominio.com` (producción)
4. Guarda y copia:
   - **Client ID** → `GOOGLE_CLIENT_ID`
   - **Client secret** → `GOOGLE_CLIENT_SECRET`

## 4. Configurar Variables de Entorno

Añade al archivo `.env` (dentro de `CapiWebBackend/`):

```env
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu-client-secret
```

> ⚠️ **IMPORTANTE:** El Client Secret es SENSIBLE. Nunca lo subas a git ni lo expongas en el frontend.

## 5. Instalar Dependencias Python

```bash
cd CapiWebBackend
source botTelegram/bin/activate
pip install google-auth google-auth-httplib2 requests
```

## 6. Ejecutar Migraciones

```bash
python manage.py makemigrations social
python manage.py migrate
```

## 7. Verificación

1. Reinicia el servidor Django
2. Accede a `/api/auth/google/config/`
3. Debe retornar:
```json
{"enabled": true, "client_id": "tu-client-id.apps.googleusercontent.com"}
```

## Troubleshooting

### Error: "Google OAuth no está configurado"
- Verifica que `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` estén en tu `.env`
- Reinicia el servidor Django

### Error: "Token de Google inválido"
- Verifica que los **Authorized JavaScript origins** incluyan tu dominio exacto
- Verifica que el Client ID en el frontend coincida con el del backend

### Error: "redirect_uri_mismatch"
- Añade la URL exacta de tu aplicación a **Authorized redirect URIs** en Google Cloud Console
