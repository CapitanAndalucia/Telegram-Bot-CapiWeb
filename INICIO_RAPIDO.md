# 🚀 Inicio Rápido - React + Django + Docker

## ⚡ Opción 1: Script Automático (Recomendado)

```bash
# Iniciar todo el entorno (Docker Compose + Django + React)
./start-dev.sh

# Detener todo el entorno
./stop-dev.sh
```

**El script automático:**
- ✅ Inicia Docker Compose en modo detached
- ✅ Inicia Django Backend
- ✅ Inicia React Frontend
- ✅ Verifica dependencias
- ✅ Detiene todo correctamente al finalizar

---

## 🔧 Opción 2: Manual

### Docker Compose

```bash
# Terminal 1 - Docker (desde la carpeta del backend)
cd CapiWebBackend
docker compose -f local.yml up --detach
# O si tienes la versión antigua:
docker-compose -f local.yml up --detach
```

**Nota:** El archivo de configuración es `local.yml` en la carpeta `CapiWebBackend/`

### Backend Django

```bash
# Terminal 2 - Backend
cd CapiWebBackend
source botTelegram/bin/activate
python manage.py runserver
```

### Frontend React

```bash
# Terminal 3 - Frontend
cd CapiWebFrontend
npm run dev
```

### Detener servicios manualmente

```bash
# Detener Docker Compose (desde la carpeta del backend)
cd CapiWebBackend
docker compose -f local.yml stop
# O: docker-compose -f local.yml stop

# Detener Django y React
# Presiona Ctrl+C en cada terminal
```

---

## 🌐 URLs

- **Frontend React:** http://localhost:5173
- **Backend Django:** http://localhost:8000
- **Admin Django:** http://localhost:8000/admin

---

## 📝 Primera vez

### 0. Verificar Docker

```bash
# Verificar que Docker esté instalado
docker --version
docker compose version

# Si no está instalado, instálalo desde:
# https://docs.docker.com/get-docker/
```

### 1. Instalar dependencias de React

```bash
cd BotTelegram
npm install
```

### 2. Configurar variables de entorno

```bash
cd BotTelegram
cp .env.example .env
```

### 3. Configurar Backend (Django)

```bash
cd CapiWebBackend
cp .env.example .env
# Edita .env con tus API Keys (Telegram, Gemini)
```

### 3. Configurar Django (si no está configurado)

Edita `CapiWebBackend/config/settings.py`:

```python
# Agregar a INSTALLED_APPS
INSTALLED_APPS = [
    # ...
    'corsheaders',
    'rest_framework',
]

# Agregar a MIDDLEWARE (al principio)
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    # ...
]

# Configuración CORS
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
]
CORS_ALLOW_CREDENTIALS = True
```

### 4. Instalar dependencias de Django

```bash
cd CapiWebBackend
source botTelegram/bin/activate
pip install django-cors-headers djangorestframework
```

---

## ✅ Verificar que todo funciona

1. Abre http://localhost:5173
2. Deberías ver el hub de aplicaciones
3. Intenta hacer login (si ya tienes usuario)
4. O regístrate para crear uno nuevo

### 🤖 Ejecutar el Bot de Telegram

```bash
# En una nueva terminal:
cd TelegramBot
# Instalar dependencias (si es la primera vez)
pip install -r requirements.txt
# Ejecutar bot
python BotTelegram.py
```


---

## 🐛 Problemas comunes

### Error de CORS
- Verifica que `django-cors-headers` esté instalado
- Revisa la configuración en `settings.py`

### Puerto en uso
```bash
# Liberar puerto 8000 (Django)
kill $(lsof -t -i:8000)

# Liberar puerto 5173 (React)
kill $(lsof -t -i:5173)
```

### Dependencias faltantes
```bash
# React
cd BotTelegram && npm install

# Django
cd CapiWebBackend && pip install -r requirements.txt
```

---

## 📚 Más información

- **Documentación React:** `README_REACT.md`
- **Guía de integración:** `INTEGRACION_DJANGO_REACT.md`
- **Resumen completo:** `RESUMEN_MIGRACION.md`

---

¡Listo! 🎉 Ahora puedes empezar a desarrollar.
