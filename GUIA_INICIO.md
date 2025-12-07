# 🚀 Guía de Inicio Rápido - CapiWeb & BotTelegram

Esta guía te ayudará a configurar y ejecutar el proyecto inmediatamente después de clonar el repositorio.

## 📋 1. Requisitos Previos

Asegúrate de tener instalado lo siguiente en tu sistema (Linux):

- **Python 3.8+**: `python3 --version`
- **Node.js (v18+ recomendado)**: `node --version`
- **pnpm**: Gestor de paquetes rápido. Instálalo con:
  ```bash
  npm install -g pnpm
  ```
- **Docker y Docker Compose**: Necesarios para la base de datos y servicios auxiliares.

## 🐍 2. Configuración de Python (Comando `python`)

Si tienes `python3` instalado pero quieres usar el comando `python` (o si algún script lo requiere), tienes dos opciones:

**Opción A (Recomendada para Ubuntu/Debian):**
Instala el paquete que hace el enlace automáticamente:
```bash
sudo apt update
sudo apt install python-is-python3
```

**Opción B (Alias temporal):**
Agrega un alias en tu terminal (o en tu `.bashrc`):
```bash
alias python=python3
```

## 🛠️ 3. Instalación y Configuración Paso a Paso

### Paso 1: Backend (Django)

1.  Navega a la carpeta del backend:
    ```bash
    cd CapiWebBackend
    ```

2.  Crea el entorno virtual (aisla las librerías del proyecto):
    ```bash
    python3 -m venv botTelegram
    ```

3.  Activa el entorno virtual:
    ```bash
    source botTelegram/bin/activate
    ```
    *(Verás `(botTelegram)` al inicio de tu terminal)*.

    > **Configuración Recomendada (Opcional pero útil):**
    > Para que el entorno cargue automáticamente las variables de entorno y configuración de Django, edita el script de activación:
    > 1. Abre el archivo `botTelegram/bin/activate`.
    > 2. Busca la función `deactivate ()` y añade al final de la función:
    >    ```bash
    >    unset COMPOSE_FILE
    >    unset DJANGO_SETTINGS_MODULE
    >    ```
    > 3. Ve al **final del archivo** y añade:
    >    ```bash
    >    export COMPOSE_FILE="local.yml"
    >    export DJANGO_SETTINGS_MODULE="config.settings.local"
    >    ```

4.  Instala las dependencias:
    ```bash
    pip install -r requirements.txt
    ```

5.  Configura las variables de entorno:
    Crea un archivo `.env` basado en el ejemplo:
    ```bash
    cp .env.example .env
    ```
    **Importante:** Abre el archivo `.env` y rellena los valores necesarios (Tokens, claves, etc.).

### Paso 2: Frontend (Angular)

1.  Navega a la carpeta de Angular:
    ```bash
    cd ../CapiWebFrontEndAngular
    ```

2.  Instala las dependencias:
    ```bash
    pnpm install
    ```


## ▶️ 4. Ejecución del Proyecto

La forma más sencilla de arrancar todo es usar el script automatizado que viene en la raíz del proyecto.

1.  Vuelve a la raíz del proyecto:
    ```bash
    cd ..
    ```

2.  Dale permisos de ejecución (solo la primera vez):
    ```bash
    chmod +x start-dev.sh stop-dev.sh
    ```

3.  **Arranca todo:**
    ```bash
    ./start-dev.sh
    ```

Este script se encargará de:
- Levantar los servicios de Docker (Base de datos, Redis, etc.).
- Iniciar el servidor Django (Backend).
- Iniciar el servidor de desarrollo de Angular.

### 🌐 URLs Disponibles
- **Backend (API):** [http://localhost:8000](http://localhost:8000)
- **Frontend Angular:** [http://localhost:4200](http://localhost:4200)
- **Panel Admin Django:** [http://localhost:8000/admin](http://localhost:8000/admin)

## 🛑 5. Detener el Proyecto

Para parar todos los servicios correctamente:
```bash
./stop-dev.sh
```

## 💡 Comandos Útiles Adicionales

**Crear un Superusuario (Admin) para Django:**
```bash
cd CapiWebBackend
source botTelegram/bin/activate
python manage.py createsuperuser
```

**Aplicar migraciones (si hay cambios en la base de datos):**
```bash
cd CapiWebBackend
source botTelegram/bin/activate
python manage.py migrate
```

## 📘 Apéndice: Guía de Instalación Detallada

### 🐳 Instalación de Docker y Docker Compose (Ubuntu/Debian)

1.  **Actualiza los repositorios:**
    ```bash
    sudo apt update
    sudo apt install ca-certificates curl gnupg
    ```

2.  **Añade la clave GPG oficial de Docker:**
    ```bash
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    ```

3.  **Configura el repositorio:**
    ```bash
    echo \
      "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    ```

4.  **Instala Docker Engine:**
    ```bash
    sudo apt update
    sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ```

5.  **Configura tu usuario (para no usar sudo con docker):**
    ```bash
    sudo usermod -aG docker $USER
    newgrp docker
    ```

### 🐍 Instalación de Python 3 (Ubuntu/Debian)

La mayoría de distribuciones Linux ya vienen con Python 3.

1.  **Verificar instalación:**
    ```bash
    python3 --version
    ```

2.  **Si no está instalado o necesitas una versión más reciente:**
    ```bash
    sudo apt update
    sudo apt install python3 python3-pip python3-venv
    ```

3.  **Instalar `python-is-python3` (Opcional):**
    Para poder usar el comando `python` en lugar de `python3`:
    ```bash
    sudo apt install python-is-python3
    ```
