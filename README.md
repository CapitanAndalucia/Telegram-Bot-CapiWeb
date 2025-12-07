# 🌐 CapiWeb - Plataforma Integral de Gestión y Portafolio

CapiWeb es un ecosistema digital completo que integra servicios de gestión personal, portafolio profesional y automatización mediante inteligencia artificial. El proyecto unifica un backend robusto, un frontend moderno y un bot de Telegram inteligente.

## 🏗️ Arquitectura del Sistema

El sistema se compone de tres pilares fundamentales que se comunican entre sí:

### 1. 🔙 Backend (Django REST Framework)
El núcleo lógico del sistema.
-   **Tecnología:** Python, Django, Django REST Framework.
-   **Función:** Gestiona la base de datos (PostgreSQL), la autenticación (JWT) y la lógica de negocio.
-   **Módulos Principales:**
    -   `api`: Endpoints principales y configuración de rutas.
    -   `tickets`: Sistema de gestión de gastos e incidencias.
    -   `portafolio`: CMS para gestionar proyectos y habilidades.
    -   `transfers`: Gestión de transferencias y movimientos.
    -   `notifications`: Sistema de alertas y notificaciones.
    -   `botTelegram`: Integración y endpoints específicos para el bot.

### 2. 🅰️ Frontend (Angular)
La interfaz de usuario principal.
-   **Tecnología:** Angular 17+, TypeScript, TailwindCSS.
-   **Función:** Ofrece una experiencia visual fluida para interactuar con el sistema.
-   **Secciones:**
    -   **Hub Central:** Punto de acceso a todas las aplicaciones.
    -   **Portafolio:** Visualización pública de proyectos y habilidades.
    -   **Tickets:** Interfaz para crear y gestionar tickets de gastos.
    -   **FileShare:** Sistema de gestión de archivos (tipo Google Drive).

### 3. 🤖 Telegram Bot (Python + AI)
Asistente personal inteligente.
-   **Tecnología:** Python, `python-telegram-bot`, Google Gemini AI.
-   **Función:** Permite interactuar con el sistema desde Telegram.
-   **Características Destacadas:**
    -   **Escaneo de Recibos con IA:** Envía una foto de un ticket y Gemini extrae automáticamente el concepto, fecha y total.
    -   **Gestión de Gastos:** Crea tickets en el backend directamente desde el chat.
    -   **Consultas:** Revisa tus gastos mensuales con comandos simples.

---

## 🔄 Flujo de Comunicación

1.  **Frontend ↔ Backend:** El cliente Angular consume la API REST para mostrar datos y realizar acciones (CRUD).
2.  **Bot ↔ Backend:** El bot actúa como un cliente privilegiado. Se autentica contra la API para validar usuarios de Telegram y registrar operaciones en la base de datos en nombre de ellos.
3.  **IA ↔ Bot:** El bot envía imágenes a Google Gemini para su procesamiento y recibe datos estructurados (JSON) para facilitar la creación de tickets.

---

## 🌐 Configuración de Red y Proxy (Nuevo)

Para simplificar el desarrollo y evitar problemas de CORS, el sistema utiliza un **Proxy Inverso** configurado en Angular.

### Unificación de Puertos
Aunque internamente corren dos servidores:
-   **Angular:** `http://localhost:4200`
-   **Django:** `http://localhost:8000`

**Todo el tráfico se canaliza a través del puerto 4200.**
-   Las peticiones a `/api/...`, `/admin/...` y `/static/...` son interceptadas por Angular y reenvíadas transparentemente a Django.
-   Esto permite que la aplicación se comporte como un monolito en un solo dominio, facilitando la gestión de cookies y autenticación.

### Integración en el Hub
El Hub central detecta el rol del usuario:
-   **Usuarios Staff/Superusuarios:** Ven accesos directos al **Panel de Administración** y a la **API Root** de Django directamente en el Hub.
-   **Usuarios Normales:** Estos accesos permanecen ocultos.

### Gestión de Sesiones
El sistema maneja una doble capa de limpieza al cerrar sesión:
1.  **JWT:** Elimina las cookies `access_token` y `refresh_token`.
2.  **Django Session:** Elimina las cookies `sessionid` y `csrftoken` y cierra la sesión del lado del servidor, asegurando que al salir del Hub también se cierre el acceso al Admin.

---

## 🚀 Instalación y Despliegue

Para poner en marcha el proyecto desde cero, consulta la guía detallada:

👉 **[GUIA_INICIO.md](./GUIA_INICIO.md)**

Allí encontrarás instrucciones paso a paso para:
-   Instalar dependencias (Docker, Python, Node.js).
-   Configurar variables de entorno.
-   Ejecutar el entorno de desarrollo con un solo comando.

---

## 🛠️ Tecnologías Clave

-   **Backend:** Django 4.x, DRF, PostgreSQL, Redis.
-   **Frontend:** Angular, RxJS, Vite.
-   **DevOps:** Docker, Docker Compose.
-   **AI/ML:** Google Gemini (Generative AI).
-   **Mensajería:** Telegram Bot API.

---

## 📂 Estructura del Repositorio

```text
/
├── CapiWebBackend/          # Código fuente del Backend (Django)
├── CapiWebFrontEndAngular/  # Código fuente del Frontend (Angular)
├── TelegramBot/             # Script del Bot de Telegram
├── GUIA_INICIO.md           # Instrucciones de instalación
├── start-dev.sh             # Script de arranque automático
└── docker-compose.yml       # Orquestación de contenedores (BD, Redis)
```
