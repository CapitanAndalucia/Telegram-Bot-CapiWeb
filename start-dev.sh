#!/bin/bash

# Script para iniciar el entorno de desarrollo completo
# Docker Compose + Django Backend + Angular Frontend

echo "🚀 Iniciando entorno de desarrollo..."
echo ""

# Establecer entorno de desarrollo
export ENVIRONMENT=dev

# Directorio de logs diario
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/log"
mkdir -p "${LOG_DIR}"
TODAY="$(date +%F)"
DJANGO_LOG="${LOG_DIR}/django-${TODAY}.log"
ANGULAR_LOG="${LOG_DIR}/angular-${TODAY}.log"
BOT_LOG="${LOG_DIR}/telegram_bot-${TODAY}.log"

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para verificar si un puerto está en uso
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Verificar si Docker Compose está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker no está instalado${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose no está instalado${NC}"
    exit 1
fi

# Verificar si Python está instalado
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 no está instalado${NC}"
    exit 1
fi

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no está instalado${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Verificando dependencias...${NC}"

# Iniciar Django Backend
echo -e "${GREEN}🐍 Preparando Django Backend...${NC}"
cd CapiWebBackend

# Verificar si el entorno virtual existe
if [ ! -d "botTelegram" ]; then
    echo -e "${RED}❌ Entorno virtual no encontrado. Creando...${NC}"
    python3 -m venv botTelegram
fi

# Activar entorno virtual
source botTelegram/bin/activate


# Iniciar Docker Compose desde la carpeta del backend
echo -e "${YELLOW}🐳 Iniciando servicios Docker...${NC}"
if docker compose version &> /dev/null; then
	
    docker compose -f local.yml up --detach
else
    docker-compose -f local.yml up --detach
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker Compose iniciado correctamente${NC}"
else
    echo -e "${RED}❌ Error al iniciar Docker Compose${NC}"
    exit 1
fi

echo ""

# Verificar si las dependencias están instaladas
#if ! python -c "import django" &> /dev/null; then
#    echo -e "${BLUE}📦 Instalando dependencias de Django...${NC}"
#    pip install -r requirements.txt 2>/dev/null || pip install django djangorestframework django-cors-headers
#fi

# Verificar si el puerto 8000 está en uso
if check_port 8000; then
    echo -e "${RED}⚠️  El puerto 8000 ya está en uso${NC}"
    echo "Django Backend probablemente ya está corriendo"
else
    # Iniciar Django en segundo plano
    echo -e "${GREEN}✅ Iniciando Django en http://localhost:8000${NC}"
    python3 manage.py runserver > "${DJANGO_LOG}" 2>&1 &
    DJANGO_PID=$!
    echo "Django PID: $DJANGO_PID"
    echo "Log: ${DJANGO_LOG}"
fi

cd ..


# Iniciar Angular Frontend
echo -e "${GREEN}🅰️  Iniciando Angular Frontend...${NC}"
cd CapiWebFrontEndAngular
# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Instalando dependencias de Angular...${NC}"
    pnpm install
fi
# Verificar si el puerto 4200 está en uso
if check_port 4200; then
    echo -e "${RED}⚠️  El puerto 4200 ya está en uso${NC}"
    echo "Angular Frontend probablemente ya está corriendo"
else
    # Iniciar Angular en segundo plano
    echo -e "${GREEN}✅ Iniciando Angular en http://localhost:4200${NC}"
    echo -e "${YELLOW}📝 Logs de Angular: ${ANGULAR_LOG}${NC}"
    echo -e "${YELLOW}🌐 Accesible en la red local en: http://$(hostname -I | awk '{print $1}'):4200${NC}"
    ng serve --host 0.0.0.0 > "${ANGULAR_LOG}" 2>&1 &
    ANGULAR_PID=$!
    echo "Angular PID: $ANGULAR_PID"
    echo "Log: ${ANGULAR_LOG}"
fi

cd ..

# Iniciar Bot de Telegram
echo -e "${GREEN}🤖 Iniciando Bot de Telegram...${NC}"
if pgrep -f "TelegramBot/BotTelegram.py" >/dev/null; then
    echo -e "${YELLOW}⚠️  El bot ya está corriendo${NC}"
else
    python3 TelegramBot/BotTelegram.py > "${BOT_LOG}" 2>&1 &
    BOT_PID=$!
    echo "Bot PID: $BOT_PID"
    echo "Log: ${BOT_LOG}"
fi

# echo ""
# echo -e "${GREEN}✅ Entorno de desarrollo iniciado correctamente${NC}"
# echo ""
# echo "📍 URLs disponibles:"
# echo "   - Frontend (Angular): http://localhost:4200"
# echo "   - Backend (Django): http://localhost:8000"
# echo "   - Admin Django: http://localhost:8000/admin"
# echo ""
# echo "🤖 Bot de Telegram:"
# echo "   - Log: ${BOT_LOG}"
# echo ""
# echo "📝 Logs:"
# echo "   - Django: /tmp/django.log"
# echo "   - Angular: /tmp/angular.log"
# echo ""
# echo "🛑 Para detener los servidores:"
# echo "   - Ejecuta: ./stop-dev.sh"
# echo "   - O presiona Ctrl+C y luego ejecuta: killall python node"
# echo ""

echo "📍 URLs disponibles:"
echo "   - Frontend (Angular): http://localhost:4200"
echo "   - Frontend (Red Local): http://$(hostname -I | awk '{print $1}'):4200"
echo "   - Backend (Django): http://localhost:8000"
echo "   - Admin Django: http://localhost:8000/admin"
echo ""
echo "📝 Logs:"
echo "   - Django: ${DJANGO_LOG}"
echo "   - Angular: ${ANGULAR_LOG}"
echo "   - Bot: ${BOT_LOG}"

# Mantener el script corriendo
wait
