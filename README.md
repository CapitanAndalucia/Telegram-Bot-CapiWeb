# 🚀 Mi Plataforma - Django + React

Plataforma web completa con backend Django y frontend React, que incluye gestión de tickets, portfolio profesional y portfolio artístico.

## 📁 Estructura del Proyecto

```
CapiWebFrontend/
├── CapiWebFrontend/              # 🎨 Frontend React
│   ├── src/
│   │   ├── pages/           # Páginas de la aplicación
│   │   ├── components/      # Componentes reutilizables
│   │   ├── context/         # Contextos (Auth, etc.)
│   │   ├── services/        # Servicios API
│   │   └── App.jsx
│   ├── .env                 # Variables de entorno
│   └── package.json
│
├── CapiWebBackend/          # 🐍 Backend Django
│   ├── api/                 # API REST
│   ├── tickets/             # App de tickets
│   ├── portafolio/          # App de portfolio
│   ├── core/                # App core
│   └── manage.py
│
├── TelegramBot/             # 🤖 Telegram Bot
│   ├── BotTelegram.py       # Script principal
│   ├── .env                 # Configuración del bot
│   └── requirements.txt     # Dependencias del bot
│
└── Documentación/
    ├── README_REACT.md              # Documentación React
    ├── INTEGRACION_DJANGO_REACT.md  # Guía de integración
    ├── RESUMEN_MIGRACION.md         # Resumen de migración
    └── INICIO_RAPIDO.md             # Inicio rápido
```

## ✨ Características

### 🎯 Aplicaciones

1. **Home** - Hub principal con acceso a todas las aplicaciones
2. **Login/Register** - Sistema de autenticación completo
3. **Portfolio** - CV profesional con diseño tipo VS Code
4. **Art Portfolio** - Portfolio artístico con animación RetroWave
5. **Tickets** - Sistema de gestión de tickets (CRUD completo)
6. **Telegram Bot** - Asistente con IA (Gemini) para escanear recibos y gestionar tickets


### 🔐 Seguridad

- Autenticación JWT
- Rutas protegidas
- CSRF tokens
- Validación de formularios

### 🎨 Diseño

- Material-UI components
- Diseño responsive
- Animaciones CSS
- Tema personalizado

## 🚀 Inicio Rápido

### Opción 1: Script Automático (Recomendado)

```bash
# Iniciar todo el entorno (Docker + Django + React)
./start-dev.sh

# Detener todo el entorno
./stop-dev.sh
```

**El script automático inicia:**
- 🐳 Docker Compose (modo detached)
- 🐍 Django Backend
- ⚛️ React Frontend

### Opción 2: Manual

**Terminal 1 - Docker:**
```bash
cd CapiWebBackend
docker compose up --detach
```

**Terminal 2 - Backend Django:**
```bash
cd CapiWebBackend
source botTelegram/bin/activate
python manage.py runserver
```

**Terminal 3 - Frontend React:**
```bash
cd BotTelegram
npm run dev
```

## 🌐 URLs

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:8000
- **Admin:** http://localhost:8000/admin

## 📋 Requisitos

- Docker & Docker Compose
- Python 3.8+
- Node.js 16+
- npm o yarn

## 📦 Instalación

### Primera vez

1. **Instalar dependencias de React:**
   ```bash
   cd BotTelegram
   npm install
   ```

2. **Configurar variables de entorno:**
   ```bash
   cd BotTelegram
   cp .env.example .env
   ```

3. **Configurar Backend (Django):**
   ```bash
   cd CapiWebBackend
   # Crear entorno virtual
   python3 -m venv botTelegram
   source botTelegram/bin/activate
   
   # Instalar dependencias
   pip install -r requirements.txt
   
   # Configurar variables de entorno
   cp .env.example .env
   # ¡IMPORTANTE! Edita .env con tus credenciales
   ```

4. **Configurar CORS en Django** (ver `INTEGRACION_DJANGO_REACT.md`)

## 📚 Documentación

- **[INICIO_RAPIDO.md](INICIO_RAPIDO.md)** - Guía de inicio rápido
- **[README_REACT.md](BotTelegram/README_REACT.md)** - Documentación completa de React
- **[INTEGRACION_DJANGO_REACT.md](INTEGRACION_DJANGO_REACT.md)** - Guía de integración
- **[RESUMEN_MIGRACION.md](RESUMEN_MIGRACION.md)** - Resumen de la migración

## 🛠️ Tecnologías

### Frontend
- React 19
- Material-UI
- React Router DOM
- Axios
- Vite

### Backend
- Django
- Django REST Framework
- Django REST Framework
- Django CORS Headers

### AI & Automation
- **Google Gemini AI** - Procesamiento de imágenes (OCR inteligente)
- **Python Telegram Bot** - Interfaz de chat
- **Python Dotenv** - Gestión de seguridad


## 📸 Páginas

### 🏠 Home
Hub principal con tarjetas para acceder a las diferentes aplicaciones.

### 🔐 Login/Register
Sistema completo de autenticación con validación de formularios.

### 👨‍💻 Portfolio
CV profesional con diseño tipo editor de código (VS Code style).

### 🎨 Art Portfolio
Portfolio artístico con animación RetroWave en CSS puro.

### 🎫 Tickets
Sistema completo de gestión de tickets con:
- CRUD completo
- Filtros por fecha
- Ordenamiento
- Paginación
- Estadísticas
- Edición de perfil

### 🤖 Telegram Bot
Asistente inteligente integrado con el sistema:
- **Escaneo de Recibos:** Sube una foto y Gemini AI extraerá los datos (fecha, total, concepto).
- **Gestión de Tickets:** Crea tickets directamente desde Telegram.
- **Consultas:** Revisa tus gastos mensuales con comandos simples.


## 🤝 Contribuir

Este es un proyecto personal, pero las sugerencias son bienvenidas.

## 📝 Licencia

Todos los derechos reservados © 2025 Fernando de la Rosa Moreno

## 👤 Autor

**Fernando de la Rosa Moreno**
- Email: fernandodelarosa005@gmail.com
- Location: Seville, Spain

---

## 🎯 Estado del Proyecto

✅ **Migración completada** - Todas las páginas de Django han sido migradas a React manteniendo la funcionalidad completa.

### Completado:
- ✅ 6 páginas migradas
- ✅ Sistema de autenticación
- ✅ CRUD de tickets
- ✅ Servicios API centralizados
- ✅ Documentación completa
- ✅ Scripts de desarrollo

### Backend Django:
- ✅ **NO modificado** - Todo el código Django permanece intacto
- ✅ React consume la API de Django
- ✅ Funcionalidad original preservada

---

**¿Necesitas ayuda?** Consulta `INICIO_RAPIDO.md` para empezar o `INTEGRACION_DJANGO_REACT.md` para más detalles.
