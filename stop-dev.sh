#!/bin/bash

# Script para detener el entorno de desarrollo
# Docker Compose + Django Backend + Angular Frontend

echo "🛑 Deteniendo entorno de desarrollo..."

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detener Django (puerto 8000)
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}🐍 Deteniendo Django Backend...${NC}"
    kill $(lsof -t -i:8000) 2>/dev/null
    echo "✅ Django detenido"
else
    echo "⚠️  Django no está corriendo"
fi

# Detener Angular (puerto 4200)
if lsof -Pi :4200 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}🅰️  Deteniendo Angular Frontend...${NC}"
    kill $(lsof -t -i:4200) 2>/dev/null
    echo "✅ Angular detenido"
else
    echo "⚠️  Angular no está corriendo"
fi

# source CapiWebBackend/botTelegram/bin/activate # No es necesario para detener

# Detener Docker Compose (desde la carpeta del backend)
echo -e "${YELLOW}🐳 Deteniendo servicios Docker...${NC}"
cd CapiWebBackend 2>/dev/null || cd "$(dirname "$0")/CapiWebBackend"

if docker compose version &> /dev/null; then
    docker compose -f local.yml stop
else
    docker-compose -f local.yml stop
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker Compose detenido correctamente${NC}"
else
    echo -e "${RED}⚠️  Error al detener Docker Compose (puede que no esté corriendo)${NC}"
fi

cd ..

echo ""
echo -e "${GREEN}✅ Entorno de desarrollo detenido${NC}"
