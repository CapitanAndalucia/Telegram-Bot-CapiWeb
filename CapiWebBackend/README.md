# DWES -Django-Layout-base

Base de proyecto basada en Two Scoops 1.11

- El virtualenv debe estar fuera de la carpeta del proyecto

sudo apt-get install ffmpeg

sudo apt install openjdk-8-jdk

https://archive.apache.org/dist/maven/maven-3/3.6.3/binaries/apache-maven-3.6.3-bin.tar.gz

tar -xvf apache-maven-3.6.3-bin.tar.gz

sudo mv apache-maven-3.6.3/ /usr/local/

sudo vim ~/.bashrc

PATH=/usr/local/apache-maven-3.6.3/bin:$PATH

source ~/.bashrcs


Para Django= Python3 + python3-pip

alias python='python3' en .bashrc


# contenido .envs/.local/.postgres

POSTGRES_HOST=postgres

POSTGRES_PORT=5432

POSTGRES_DB=initial

POSTGRES_USER=<tu_usuario>

POSTGRES_PASSWORD=<tu_contraseña>


# contenido config/settings/.env

DEBUG=True

SECRET_KEY=<tu_secret_key_segura>

POSTGRES_HOST=localhost

POSTGRES_PORT=5432

POSTGRES_DB=initial

POSTGRES_USER=<tu_usuario>

POSTGRES_PASSWORD=<tu_contraseña>


# Construir el docker de PostgreSQL

docker-compose build (Crea el contenedos)

Arrancar el docker

docker-compose up (Levanta el contenedor, probar conexión dbeaver)

docker-compose up -d(Levanta el contenedor en segundo plano)
docker compose stop (para parar)



# crea tu virtualenv fuera del projecto en una carpeta externa
sudo apt install python3.10-venv
python3 -m project-venv ../venvs/[project]-venv (Comando no testeado)
source ../venvs/[project]-venv/bin/activate

python3 -m venv [nombre del entrono virtual]


# CREA LAS VARIABLES DE ENTORNO NECESARIAS en el viertualenv/bin/activate
# Compose file evita tener que pasar parámetro de file a docker-compose
# Django settings evita tener que pasar --config a python manage.py
Al final del archivo
export COMPOSE_FILE="local.yml"
export DJANGO_SETTINGS_MODULE="config.settings.local"

Al final de la función deactivate()
   unset COMPOSE_FILE
   unset DJANGO_SETTINGS_MODULE

iniciar: source [nombre del entrono virutal]/bin/activate 
salir: deactivate


# Para postgres se necesita instalar dependencias previas o cambiar por el paquete binario
python -m pip install --upgrade pip
pip install -r requirements.txt

python manage.py makemigrations (detectar cambios en la forma de crear tablas en la base de datos)
python manage.py migrate (aplicar cambios a la base de datos)
python manage.py createsuperuser (crear usuario admin, despues te pedirá nombre y contraseña)
python manage.py runserver (iniciar el servidor)


# Exportar datos a fixture e importar
https://www.coderedcorp.com/blog/how-to-dump-your-django-database-and-load-it-into-/
python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.Permission --indent 2 > dump.json

loaddata fixtures/dump.json

# Borrar base de datos:

python manage.py flush

docker-compose down -v

docker-compose up --detach

python manage.py makemigrations

python manage.py migrate

# NGROK:
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
        | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null \
        && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
        | sudo tee /etc/apt/sources.list.d/ngrok.list \
        && sudo apt update \
        && sudo apt install ngrok

ngrok config add-authtoken <tu_token_de_ngrok>

ngrok http http://localhost:8000

# React:
npm create vite

cd [carpeta del proyecto]

npm install

npm run dev



