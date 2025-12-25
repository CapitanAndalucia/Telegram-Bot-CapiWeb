# 🚀 Guía Completa de Despliegue a Producción - CapiWeb

Esta guía te ayudará a desplegar CapiWeb en tu servidor de producción desde cero, incluyendo configuración de Cloudflare, SSL, y estrategias de actualización continua.

---

## 📋 Índice

1. [Requisitos del Servidor](#-1-requisitos-del-servidor)
2. [Instalación Inicial](#-2-instalación-inicial)
3. [Clonar el Proyecto](#-3-clonar-el-proyecto)
4. [Configuración de Variables de Entorno](#-4-configuración-de-variables-de-entorno)
5. [Configuración de Producción](#-5-configuración-de-producción)
6. [Dominio y Cloudflare](#-6-dominio-y-cloudflare)
7. [Despliegue con Docker](#-7-despliegue-con-docker)
8. [Servidor Web (Nginx)](#-8-servidor-web-nginx)
9. [SSL/HTTPS](#-9-sslhttps)
10. [Systemd Services](#-10-systemd-services)
11. [Consejos de Mantenimiento](#-11-consejos-de-mantenimiento)
12. [CI/CD y Automatización](#-12-cicd-y-automatización)

---

## 🖥️ 1. Requisitos del Servidor

### Hardware Mínimo Recomendado
- **CPU:** 2 cores
- **RAM:** 4 GB
- **Disco:** 40 GB SSD
- **SO:** Ubuntu 22.04 LTS (recomendado)

### Software Necesario
```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependencias básicas
sudo apt install -y git curl wget build-essential software-properties-common

# Python 3.11+
sudo apt install -y python3 python3-pip python3-venv python-is-python3

# Node.js 20+ (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm (gestor de paquetes)
npm install -g pnpm

# Docker y Docker Compose
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
newgrp docker

# Nginx (servidor web)
sudo apt install -y nginx

# Certbot (SSL)
sudo apt install -y certbot python3-certbot-nginx
```

---

## 📦 2. Instalación Inicial

### Crear usuario para la aplicación (recomendado)
```bash
sudo adduser capiweb
sudo usermod -aG docker capiweb
sudo usermod -aG www-data capiweb
su - capiweb
```

### Crear directorio de trabajo
```bash
mkdir -p ~/apps
cd ~/apps
```

---

## 📥 3. Clonar el Proyecto

```bash
# Clonar repositorio
git clone https://github.com/TU_USUARIO/CapiWeb.git
cd CapiWeb

# O si usas SSH
git clone git@github.com:TU_USUARIO/CapiWeb.git
cd CapiWeb
```

---

## 🔐 4. Configuración de Variables de Entorno

### 4.1 Backend Django - `CapiWebBackend/config/settings/.env`

Crear el archivo:
```bash
nano CapiWebBackend/config/settings/.env
```

Contenido:
```env
# Seguridad - CAMBIAR EN PRODUCCIÓN
SECRET_KEY=tu-clave-secreta-super-larga-y-aleatoria-minimo-50-caracteres
DEBUG=False

# ⭐ IMPORTANTE: Variable de entorno para cambiar entre dev/production
# dev = HTTP, sin cookies seguras, CORS localhost
# production = HTTPS, cookies seguras, HSTS activado
ENVIRONMENT=production

# Dominios permitidos en producción (separados por coma)
CORS_ALLOWED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
CSRF_TRUSTED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com

# Base de datos PostgreSQL
POSTGRES_DB=capiweb_db
POSTGRES_USER=capiweb_user
POSTGRES_PASSWORD=tu_password_seguro_aqui
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# VirusTotal (opcional, para escaneo de archivos)
VIRUSTOTAL_API_KEY=tu_api_key_virustotal
```

> [!IMPORTANT]
> **La variable `ENVIRONMENT` controla automáticamente:**
> - `ENVIRONMENT=dev` → HTTP permitido, cookies no seguras, CORS para localhost
> - `ENVIRONMENT=production` → HTTPS obligatorio, cookies seguras, HSTS activado, CORS para tus dominios

> **💡 Generar SECRET_KEY segura:**
> ```bash
> python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
> ```

### 4.2 Backend Django - `CapiWebBackend/.envs/.local/.postgres`

Crear directorios y archivo:
```bash
mkdir -p CapiWebBackend/.envs/.local
nano CapiWebBackend/.envs/.local/.postgres
```

Contenido:
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=capiweb_db
POSTGRES_USER=capiweb_user
POSTGRES_PASSWORD=tu_password_seguro_aqui
```

### 4.3 Bot de Telegram - `TelegramBot/.env`

```bash
nano TelegramBot/.env
```

Contenido:
```env
TELEGRAM_TOKEN=tu_token_de_botfather
GEMINI_API_KEY=tu_api_key_de_google_gemini
ADMIN_USERNAME=tu_usuario_django
ADMIN_PASSWORD=tu_password_django
API_BASE_URL=https://tu-dominio.com
```

### 4.4 Frontend Angular - Variables de entorno (opcional)

El frontend Angular usa `proxy.conf.json` para desarrollo. En producción, se compila y sirve estáticamente, conectándose directamente al backend.

---

## ⚙️ 5. Configuración de Producción

### 5.1 Sistema Automático con ENVIRONMENT

> [!TIP]
> El proyecto ya incluye un sistema automático de configuración. **Solo necesitas establecer la variable `ENVIRONMENT`** en tu archivo `.env` y todo se configura automáticamente.

**¿Cómo funciona?**

```
ENVIRONMENT=dev        →  HTTP, cookies no seguras, CORS localhost
ENVIRONMENT=production →  HTTPS, cookies seguras, HSTS, CORS para tus dominios
```

El archivo `production.py` **ya está incluido** en el proyecto y es seguro subirlo a GitHub porque:
- ✅ No contiene secretos (todo se lee desde variables de entorno)
- ✅ Los archivos `.env` con valores reales están en `.gitignore`

### 5.2 Configurar el `.env` para Producción

Edita `CapiWebBackend/config/settings/.env`:

```env
# ⭐ CLAVE: Establecer entorno de producción
ENVIRONMENT=production

# Seguridad
SECRET_KEY=tu-clave-secreta-super-larga-minimo-50-caracteres
DEBUG=False

# Dominios (separados por coma si son varios)
CORS_ALLOWED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
CSRF_TRUSTED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com

# Base de datos PostgreSQL
POSTGRES_DB=capiweb_db
POSTGRES_USER=capiweb_user
POSTGRES_PASSWORD=tu_password_seguro
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### 5.3 Preparar el Backend

```bash
cd CapiWebBackend

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt
pip install gunicorn psycopg2-binary

# Crear directorio de logs (requerido por production.py)
mkdir -p logs

# El entorno se detecta automáticamente, pero puedes forzarlo:
export ENVIRONMENT=production

# Ejecutar migraciones
python manage.py migrate

# Recolectar archivos estáticos
python manage.py collectstatic --noinput

# Crear superusuario
python manage.py createsuperuser
```

### 5.3 Compilar el Frontend Angular

```bash
cd CapiWebFrontEndAngular

# Instalar dependencias
pnpm install

# Compilar para producción
pnpm run build

# Los archivos estarán en dist/CapiWebFrontEndAngular/browser/
```

---

## 🌐 6. Dominio y Cloudflare

### 6.1 Configurar DNS en Cloudflare

1. **Registrar dominio** en tu proveedor favorito (Namecheap, GoDaddy, etc.)
2. **Añadir sitio a Cloudflare:**
   - Ir a [dash.cloudflare.com](https://dash.cloudflare.com)
   - Click en "Add a Site"
   - Seguir instrucciones para cambiar nameservers

3. **Configurar registros DNS:**
   | Tipo | Nombre | Contenido | Proxy |
   |------|--------|-----------|-------|
   | A | @ | IP_DE_TU_SERVIDOR | ✅ Proxied |
   | A | www | IP_DE_TU_SERVIDOR | ✅ Proxied |
   | A | api | IP_DE_TU_SERVIDOR | ✅ Proxied |

### 6.2 Configuración SSL en Cloudflare

1. Ir a **SSL/TLS** → **Overview**
2. Seleccionar **Full (strict)**
3. Ir a **Edge Certificates** y activar:
   - Always Use HTTPS ✅
   - Automatic HTTPS Rewrites ✅
   - Minimum TLS Version: TLS 1.2

### 6.3 Cloudflare Tunnel (Alternativa sin abrir puertos)

Si no quieres abrir puertos en tu router:

```bash
# Instalar cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Autenticarse
cloudflared tunnel login

# Crear túnel
cloudflared tunnel create capiweb

# Configurar túnel
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: TU_TUNNEL_ID
credentials-file: /home/capiweb/.cloudflared/TU_TUNNEL_ID.json

ingress:
  - hostname: tu-dominio.com
    service: http://localhost:80
  - hostname: www.tu-dominio.com
    service: http://localhost:80
  - service: http_status:404
```

```bash
# Ejecutar túnel
cloudflared tunnel run capiweb
```

---

## 🐳 7. Despliegue con Docker

### 7.1 Docker Compose para Producción

Crear `docker-compose.prod.yml` en la raíz:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: capiweb_postgres
    restart: always
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - postgres_backups:/backups
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: capiweb_redis
    restart: always
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data

  django:
    build:
      context: ./CapiWebBackend
      dockerfile: Dockerfile.prod
    container_name: capiweb_django
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DJANGO_SETTINGS_MODULE: config.settings.production
    env_file:
      - ./CapiWebBackend/config/settings/.env
    volumes:
      - static_volume:/app/staticfiles
      - media_volume:/app/media
    ports:
      - "127.0.0.1:8000:8000"
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3

  telegram_bot:
    build:
      context: ./TelegramBot
      dockerfile: Dockerfile
    container_name: capiweb_telegram
    restart: always
    depends_on:
      - django
    env_file:
      - ./TelegramBot/.env

volumes:
  postgres_data:
  postgres_backups:
  redis_data:
  static_volume:
  media_volume:
```

### 7.2 Dockerfile para Django

Crear `CapiWebBackend/Dockerfile.prod`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements e instalar
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn psycopg2-binary

# Copiar código
COPY . .

# Recolectar estáticos
RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
```

### 7.3 Iniciar servicios

```bash
# Crear archivo .env en la raíz para docker-compose
cp CapiWebBackend/config/settings/.env .env

# Levantar servicios
docker compose -f docker-compose.prod.yml up -d

# Ver logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## 🔧 8. Servidor Web (Nginx)

### 8.1 Configuración de Nginx

```bash
sudo nano /etc/nginx/sites-available/capiweb
```

```nginx
# Redirigir HTTP a HTTPS
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;
    return 301 https://$server_name$request_uri;
}

# Servidor HTTPS principal
server {
    listen 443 ssl http2;
    server_name tu-dominio.com www.tu-dominio.com;

    # SSL Certificates (Certbot los generará)
    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Logs
    access_log /var/log/nginx/capiweb_access.log;
    error_log /var/log/nginx/capiweb_error.log;

    # Tamaño máximo de subida
    client_max_body_size 100M;

    # Frontend Angular (archivos estáticos)
    location / {
        root /home/capiweb/apps/CapiWeb/CapiWebFrontEndAngular/dist/CapiWebFrontEndAngular/browser;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend Django API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Django Admin
    location /admin/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Archivos estáticos de Django
    location /static/ {
        alias /home/capiweb/apps/CapiWeb/CapiWebBackend/staticfiles/;
    }

    # Archivos media de Django
    location /media/ {
        alias /home/capiweb/apps/CapiWeb/CapiWebBackend/media/;
    }
}
```

```bash
# Habilitar sitio
sudo ln -s /etc/nginx/sites-available/capiweb /etc/nginx/sites-enabled/

# Verificar configuración
sudo nginx -t

# Recargar Nginx
sudo systemctl reload nginx
```

---

## 🔒 9. SSL/HTTPS

### Con Certbot (Let's Encrypt)

```bash
# Obtener certificado
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com

# Renovación automática (ya está configurada)
sudo certbot renew --dry-run
```

### Con Cloudflare Origin Certificate

Si usas Cloudflare Tunnel o proxy, puedes usar Origin Certificates:

1. En Cloudflare → SSL/TLS → Origin Server
2. Create Certificate
3. Guardar en `/etc/ssl/cloudflare/`

---

## 🔄 10. Systemd Services

### 10.1 Servicio para Django (Gunicorn)

```bash
sudo nano /etc/systemd/system/capiweb-django.service
```

```ini
[Unit]
Description=CapiWeb Django Application
After=network.target postgresql.service

[Service]
User=capiweb
Group=www-data
WorkingDirectory=/home/capiweb/apps/CapiWeb/CapiWebBackend
Environment="ENVIRONMENT=production"
ExecStart=/home/capiweb/apps/CapiWeb/CapiWebBackend/venv/bin/gunicorn \
    --access-logfile - \
    --workers 3 \
    --bind unix:/run/capiweb/gunicorn.sock \
    config.wsgi:application
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### 10.2 Servicio para el Bot de Telegram

```bash
sudo nano /etc/systemd/system/capiweb-telegram.service
```

```ini
[Unit]
Description=CapiWeb Telegram Bot
After=network.target capiweb-django.service

[Service]
User=capiweb
WorkingDirectory=/home/capiweb/apps/CapiWeb/TelegramBot
Environment="ENVIRONMENT=production"
ExecStart=/home/capiweb/apps/CapiWeb/CapiWebBackend/venv/bin/python BotTelegram.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 10.3 Habilitar servicios

```bash
# Crear directorio para socket
sudo mkdir -p /run/capiweb
sudo chown capiweb:www-data /run/capiweb

# Habilitar y arrancar servicios
sudo systemctl daemon-reload
sudo systemctl enable capiweb-django capiweb-telegram
sudo systemctl start capiweb-django capiweb-telegram

# Ver estado
sudo systemctl status capiweb-django
sudo systemctl status capiweb-telegram
```

---

## 💡 11. Consejos de Mantenimiento

### 11.1 Script de Actualización Rápida

Crear `~/apps/CapiWeb/update-prod.sh`:

```bash
#!/bin/bash
set -e

echo "🔄 Actualizando CapiWeb..."

cd ~/apps/CapiWeb

# Pull de cambios
echo "📥 Descargando últimos cambios..."
git pull origin main

# Backend
echo "🐍 Actualizando Backend..."
cd CapiWebBackend
source venv/bin/activate
export ENVIRONMENT=production
pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py collectstatic --noinput
deactivate

# Frontend
echo "🅰️ Compilando Frontend..."
cd ../CapiWebFrontEndAngular
pnpm install
pnpm run build

# Reiniciar servicios
echo "🔄 Reiniciando servicios..."
sudo systemctl restart capiweb-django
sudo systemctl restart capiweb-telegram
sudo systemctl reload nginx

echo "✅ ¡Actualización completada!"
```

```bash
chmod +x ~/apps/CapiWeb/update-prod.sh
```

Uso:
```bash
./update-prod.sh
```

### 11.2 Backups Automáticos

Crear `~/scripts/backup-capiweb.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/home/capiweb/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup de PostgreSQL
docker exec capiweb_postgres pg_dump -U capiweb_user capiweb_db > $BACKUP_DIR/db_$DATE.sql

# Backup de media
tar -czf $BACKUP_DIR/media_$DATE.tar.gz -C /home/capiweb/apps/CapiWeb/CapiWebBackend media/

# Limpiar backups antiguos (mantener últimos 7 días)
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completado: $DATE"
```

Añadir a crontab:
```bash
crontab -e
# Añadir:
0 3 * * * /home/capiweb/scripts/backup-capiweb.sh
```

### 11.3 Monitorización

```bash
# Ver logs en tiempo real
sudo journalctl -u capiweb-django -f
sudo journalctl -u capiweb-telegram -f

# Ver uso de recursos
htop
docker stats
```

---

## 🤖 12. CI/CD y Automatización

### 12.1 GitHub Actions (Recomendado)

Crear `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/apps/CapiWeb
            ./update-prod.sh
```

Configurar secrets en GitHub:
- `SERVER_HOST`: IP o dominio del servidor
- `SERVER_USER`: `capiweb`
- `SSH_PRIVATE_KEY`: Clave privada SSH

### 12.2 Webhook Simple (Alternativa ligera)

Si prefieres algo más simple sin GitHub Actions:

```python
# webhook_deploy.py
from flask import Flask, request
import subprocess
import hmac
import hashlib

app = Flask(__name__)
SECRET = "tu_webhook_secret"

@app.route('/deploy', methods=['POST'])
def deploy():
    signature = request.headers.get('X-Hub-Signature-256')
    if not verify_signature(request.data, signature):
        return 'Invalid signature', 403
    
    subprocess.Popen(['/home/capiweb/apps/CapiWeb/update-prod.sh'])
    return 'Deployment started', 200

def verify_signature(payload, signature):
    expected = 'sha256=' + hmac.new(SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=9000)
```

### 12.3 Jenkins (Para equipos más grandes)

Si prefieres Jenkins:

```bash
# Instalar Jenkins
wget -q -O - https://pkg.jenkins.io/debian/jenkins.io.key | sudo apt-key add -
sudo sh -c 'echo deb http://pkg.jenkins.io/debian-stable binary/ > /etc/apt/sources.list.d/jenkins.list'
sudo apt update
sudo apt install jenkins

# Configurar en http://tu-servidor:8080
```

---

## 📊 Resumen de Comandos Útiles

| Acción | Comando |
|--------|---------|
| Ver logs Django | `sudo journalctl -u capiweb-django -f` |
| Ver logs Telegram | `sudo journalctl -u capiweb-telegram -f` |
| Reiniciar Django | `sudo systemctl restart capiweb-django` |
| Reiniciar Bot | `sudo systemctl restart capiweb-telegram` |
| Actualizar todo | `./update-prod.sh` |
| Backup manual | `./backup-capiweb.sh` |
| Ver contenedores | `docker ps` |
| Logs de contenedor | `docker logs capiweb_postgres -f` |

---

## ❓ Troubleshooting

### Error 502 Bad Gateway
```bash
# Verificar que Gunicorn esté corriendo
sudo systemctl status capiweb-django

# Ver logs
sudo journalctl -u capiweb-django -n 50
```

### Permisos de static/media
```bash
sudo chown -R capiweb:www-data /home/capiweb/apps/CapiWeb/CapiWebBackend/staticfiles
sudo chown -R capiweb:www-data /home/capiweb/apps/CapiWeb/CapiWebBackend/media
```

### Base de datos no conecta
```bash
# Verificar PostgreSQL
docker ps | grep postgres
docker logs capiweb_postgres

# Probar conexión
docker exec -it capiweb_postgres psql -U capiweb_user -d capiweb_db
```

---

**¡Tu servidor de producción está listo!** 🎉

Recuerda:
- 📌 Hacer backups regularmente
- 🔐 Mantener las claves seguras
- 📊 Monitorizar el servidor
- 🔄 Actualizar dependencias periódicamente
