# 🚀 CapiWeb - Plataforma Completa Django + React

Plataforma web completa con backend Django y frontend React, que incluye gestión de tickets, portfolio profesional, portfolio artístico y **sistema de compartir archivos con seguridad avanzada**.

## 📁 Estructura del Proyecto

```
BotTelegram/
├── CapiWebFrontend/              # 🎨 Frontend React
│   ├── src/
│   │   ├── pages/
│   │   │   ├── hub/              # Hub principal
│   │   │   ├── login/            # Login/Register
│   │   │   ├── portfolio/        # Portfolio profesional
│   │   │   ├── artportfolio/     # Portfolio artístico
│   │   │   ├── tickets/          # Gestión de tickets
│   │   │   └── fileshare/        # 📁 Compartir archivos
│   │   ├── components/           # Componentes reutilizables
│   │   ├── context/              # Contextos (Auth, etc.)
│   │   ├── services/             # Servicios API
│   │   └── utils/                # Utilidades (securityConfig, etc.)
│   ├── public/
│   │   └── security_config.json  # Configuración de seguridad
│   └── package.json
│
├── CapiWebBackend/               # 🐍 Backend Django
│   ├── api/                      # API REST
│   ├── tickets/                  # App de tickets
│   ├── portafolio/               # App de portfolio
│   ├── social/                   # Sistema de amigos
│   ├── transfers/                # 📁 Transferencia de archivos
│   │   ├── models.py
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── security_utils.py     # 🔒 Utilidades de seguridad
│   ├── notifications/            # Sistema de notificaciones
│   ├── core/                     # App core
│   └── config/settings/
│
├── security_config.json          # 🔒 Configuración centralizada de seguridad
│
├── TelegramBot/                  # 🤖 Telegram Bot
│   ├── BotTelegram.py
│   └── requirements.txt
│
└── Documentación/
    ├── SECURITY_AUDIT.md         # Auditoría de seguridad
    ├── VIRUSTOTAL_SETUP.md       # Configuración de VirusTotal/ClamAV
    ├── MALWARE_SCANNER_CONFIG.md # Configuración de escáneres
    └── ...
```

## ✨ Características

### 🎯 Aplicaciones

1. **🏠 Home** - Hub principal con acceso a todas las aplicaciones
2. **🔐 Login/Register** - Sistema de autenticación completo con JWT
3. **👨‍💻 Portfolio** - CV profesional con diseño tipo VS Code
4. **🎨 Art Portfolio** - Portfolio artístico con animación RetroWave
5. **🎫 Tickets** - Sistema de gestión de tickets (CRUD completo)
6. **📁 FileShare** - **NUEVO** Sistema de compartir archivos con seguridad avanzada
7. **🤖 Telegram Bot** - Asistente con IA (Gemini) para escanear recibos

### 📁 Sistema de Compartir Archivos (FileShare)

**Características principales:**
- 📤 **Subida de archivos** hasta 30 GB
- 👥 **Sistema de amigos** - Envía archivos solo a amigos aprobados
- 🔔 **Notificaciones en tiempo real** - Recibe alertas de nuevos archivos
- 👁️ **Indicadores de archivos nuevos** - Visualiza qué archivos no has visto
- 🖼️ **Vista previa de archivos** - Modal con preview de imágenes
- 📊 **Vistas múltiples** - Cambia entre vista de cuadrícula y lista
- 📱 **Responsive** - Sidebar móvil para lista de amigos
- ⏰ **Expiración automática** - Archivos se eliminan después de 3 días
- 🗑️ **Eliminación manual** - Botón para borrar archivos

**Seguridad avanzada:**
- 🔒 **Validación de tipos** - Solo archivos permitidos (imágenes, audio, video, documentos, archivos comprimidos)
- 🚫 **Bloqueo de ejecutables** - `.exe`, `.bat`, `.sh` bloqueados por defecto
- 🔍 **Escaneo de archivos comprimidos** - Detecta ejecutables dentro de ZIP/RAR
- ⚠️ **Advertencias de seguridad** - Notificaciones antes de descargar archivos peligrosos
- 🛡️ **Detección de malware** - Integración con VirusTotal o ClamAV
- 🔐 **Sanitización de nombres** - Protección contra inyecciones (SQL, XSS, path traversal)
- ⏱️ **Rate limiting inteligente** - Límites basados en tamaño de archivo
- 📋 **Configuración centralizada** - `security_config.json` compartido entre frontend y backend

### 🔐 Seguridad

**Autenticación:**
- JWT tokens con refresh
- Sesiones de 30 días
- CSRF protection
- Rutas protegidas

**Validación de archivos:**
- Límite de 30 GB por archivo (configurable)
- Tipos permitidos: imágenes, audio, video, ZIP/RAR, documentos
- Tipos bloqueados: ejecutables (.exe, .bat, .sh, etc.)
- Validación de nombres contra inyecciones

**Escaneo de malware:**
- **VirusTotal** - 500 escaneos/día gratis, 70+ motores antivirus
- **ClamAV** - Escaneos ilimitados, funciona offline
- Configurable en `security_config.json`

**Rate limiting:**
- Archivos >100 GB: 1 cada 5 minutos
- Archivos <100 GB: 1 cada minuto
- Configurable por tamaño

### 🎨 Diseño

- **Glassmorphism** - Efectos de vidrio esmerilado
- **Animaciones suaves** - Framer Motion
- **Tema oscuro** - Diseño moderno con acentos cyan
- **Responsive** - Adaptado a móviles y tablets
- **Toast notifications** - react-hot-toast para feedback visual

## 🚀 Inicio Rápido

### Opción 1: Script Automático (Recomendado)

```bash
# Iniciar todo el entorno (Docker + Django + React)
./start-dev.sh

# Detener todo el entorno
./stop-dev.sh
```

**El script automático inicia:**
- 🐳 Docker Compose (PostgreSQL)
- 🐍 Django Backend (puerto 8000)
- ⚛️ React Frontend (puerto 5173)

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
cd CapiWebFrontend
npm run dev
```

## 🌐 URLs

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000/api
- **Admin Django:** http://localhost:8000/admin
- **Documentación API:** http://localhost:8000/api/docs

## 📋 Requisitos

- Docker & Docker Compose
- Python 3.10+
- Node.js 18+
- npm o yarn

## 📦 Instalación

### Primera vez

1. **Clonar repositorio:**
   ```bash
   git clone <tu-repo>
   cd BotTelegram
   ```

2. **Instalar dependencias de React:**
   ```bash
   cd CapiWebFrontend
   npm install
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
   cp config/settings/.env.example config/settings/.env
   # Edita .env con tus credenciales
   ```

4. **Aplicar migraciones:**
   ```bash
   python manage.py migrate
   ```

5. **Crear superusuario:**
   ```bash
   python manage.py createsuperuser
   ```

6. **(Opcional) Configurar VirusTotal:**
   - Obtén API Key en https://www.virustotal.com
   - Añade a `.env`: `VIRUSTOTAL_API_KEY=tu_key_aqui`
   - Ver `VIRUSTOTAL_SETUP.md` para más detalles

## 🛠️ Tecnologías

### Frontend
- **React 19** - Framework principal
- **Vite** - Build tool
- **React Router DOM** - Navegación
- **Framer Motion** - Animaciones
- **react-hot-toast** - Notificaciones
- **Axios** - HTTP client

### Backend
- **Django 4.1** - Framework web
- **Django REST Framework** - API REST
- **Django CORS Headers** - CORS
- **PostgreSQL** - Base de datos
- **JWT** - Autenticación

### Seguridad
- **VirusTotal API** - Detección de malware (opcional)
- **ClamAV** - Antivirus local (opcional)
- **pyclamd** - Integración con ClamAV
- **vt-py** - Cliente de VirusTotal
- **rarfile** - Escaneo de archivos RAR

### AI & Automation
- **Google Gemini AI** - OCR inteligente
- **Python Telegram Bot** - Interfaz de chat

## 📸 Páginas

### 🏠 Home (Hub)
Hub principal con tarjetas para acceder a las diferentes aplicaciones.

### 🔐 Login/Register
Sistema completo de autenticación con:
- Validación de formularios
- JWT tokens
- Refresh automático
- Redirección inteligente

### 👨‍💻 Portfolio
CV profesional con diseño tipo editor de código (VS Code style):
- Sintaxis highlighting
- Tabs navegables
- Diseño moderno

### 🎨 Art Portfolio
Portfolio artístico con:
- Animación RetroWave en CSS puro
- Galería de imágenes
- Diseño futurista

### 🎫 Tickets
Sistema completo de gestión de tickets:
- CRUD completo
- Filtros por fecha
- Ordenamiento
- Paginación
- Estadísticas
- Edición de perfil

### 📁 FileShare (Sistema de Archivos)

**Características:**

**Gestión de Amigos:**
- Enviar solicitudes de amistad
- Aceptar/rechazar solicitudes
- Ver lista de amigos
- Buscar usuarios

**Compartir Archivos:**
- Subir archivos (hasta 30 GB)
- Enviar a amigos específicos
- Drag & drop
- Barra de progreso
- Validación en tiempo real

**Recibir Archivos:**
- Notificaciones de nuevos archivos
- Indicadores visuales (badge "NUEVO")
- Vista previa de imágenes
- Descarga con advertencias de seguridad
- Eliminación de archivos

**Vistas:**
- Vista de cuadrícula (grid)
- Vista de lista
- Cambio instantáneo entre vistas

**Seguridad:**
- Escaneo de malware
- Validación de tipos
- Detección de ejecutables en ZIP/RAR
- Rate limiting
- Expiración automática (3 días)

### 🤖 Telegram Bot
Asistente inteligente integrado:
- **Escaneo de Recibos:** Gemini AI extrae datos automáticamente
- **Gestión de Tickets:** Crea tickets desde Telegram
- **Consultas:** Revisa gastos mensuales

## 🔒 Configuración de Seguridad

### Archivo de Configuración

Edita `security_config.json` para personalizar:

```json
{
  "file_validation": {
    "max_file_size_gb": 30,
    "allowed_extensions": {
      "images": [".jpg", ".png", ...],
      "audio": [".mp3", ".wav", ...],
      "video": [".mp4", ".avi", ...],
      "archives": [".zip", ".rar", ...],
      "documents": [".pdf", ".txt", ...]
    },
    "blocked_extensions": [".exe", ".bat", ".sh", ...]
  },
  "malware_scanning": {
    "enabled": true,
    "scanner": "virustotal",  // o "clamav"
    "virustotal": {
      "enabled": true,
      "max_file_size_mb": 650
    },
    "clamav": {
      "enabled": false
    }
  },
  "rate_limiting": {
    "large_file_threshold_gb": 100,
    "large_file_cooldown_seconds": 300,
    "normal_file_cooldown_seconds": 60
  }
}
```

### Opciones de Escaneo

**VirusTotal (Recomendado para empezar):**
```bash
# Obtener API Key en virustotal.com
# Añadir a .env:
VIRUSTOTAL_API_KEY=tu_key_aqui
```

**ClamAV (Para producción):**
```bash
# Instalar en Ubuntu/Debian
sudo apt install clamav clamav-daemon
sudo freshclam
sudo systemctl start clamav-daemon
```

Ver `VIRUSTOTAL_SETUP.md` y `MALWARE_SCANNER_CONFIG.md` para más detalles.

## 📚 Documentación

### Guías Principales
- **[INICIO_RAPIDO.md](INICIO_RAPIDO.md)** - Guía de inicio rápido
- **[README_REACT.md](CapiWebFrontend/README_REACT.md)** - Documentación de React
- **[INTEGRACION_DJANGO_REACT.md](INTEGRACION_DJANGO_REACT.md)** - Guía de integración

### Seguridad
- **[SECURITY_AUDIT.md](SECURITY_AUDIT.md)** - Auditoría completa de seguridad
- **[VIRUSTOTAL_SETUP.md](VIRUSTOTAL_SETUP.md)** - Configuración de VirusTotal/ClamAV
- **[MALWARE_SCANNER_CONFIG.md](MALWARE_SCANNER_CONFIG.md)** - Configuración de escáneres

## 🧪 Testing

### Test de Seguridad

```bash
# Test 1: Archivo ejecutable bloqueado
touch malware.exe
# Intentar subir → Rechazado

# Test 2: ZIP con ejecutables
touch virus.exe
zip test.zip virus.exe
# Subir → Aceptado
# Descargar → Advertencia de seguridad

# Test 3: Archivo muy grande
dd if=/dev/zero of=huge.zip bs=1G count=31
# Intentar subir → Rechazado (>30GB)

# Test 4: Rate limiting
# Subir archivo 1 → OK
# Subir archivo 2 inmediatamente → Rechazado
```

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

✅ **Proyecto Completo** - Todas las funcionalidades implementadas y probadas.

### Completado:
- ✅ 7 páginas completas (Hub, Login, Portfolio, Art, Tickets, FileShare, Telegram Bot)
- ✅ Sistema de autenticación JWT
- ✅ CRUD de tickets
- ✅ Sistema de compartir archivos con seguridad avanzada
- ✅ Sistema de amigos y notificaciones
- ✅ Detección de malware (VirusTotal/ClamAV)
- ✅ Escaneo de archivos comprimidos
- ✅ Rate limiting inteligente
- ✅ Configuración centralizada
- ✅ Documentación completa

### Características de Seguridad:
- ✅ Validación de archivos (30GB máx)
- ✅ Tipos permitidos/bloqueados configurables
- ✅ Sanitización de nombres de archivo
- ✅ Escaneo de contenido de ZIP/RAR
- ✅ Detección de malware (VirusTotal o ClamAV)
- ✅ Rate limiting basado en tamaño
- ✅ Advertencias de seguridad en frontend
- ✅ Notificaciones toast elegantes

### Backend Django:
- ✅ API REST completa
- ✅ Sistema de autenticación robusto
- ✅ Modelos optimizados
- ✅ Seguridad implementada

---

**¿Necesitas ayuda?**
- Inicio rápido: `./start-dev.sh`
- Configuración de seguridad: Ver `SECURITY_AUDIT.md`
- Configuración de VirusTotal: Ver `VIRUSTOTAL_SETUP.md`
- Problemas: Consulta la documentación en `/Documentación`


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
