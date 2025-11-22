import os
import json
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import google.generativeai as genai
from PIL import Image
import io
import requests
from datetime import datetime
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# ==================== CONFIGURACIÓN ====================
# API URLs
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")
API_TICKETS_URL = f"{API_BASE_URL}/api/tickets/"
API_AUTH_URL = f"{API_BASE_URL}/api/auth/"

# Tokens y API Keys
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Credenciales del admin para autenticación del bot
ADMIN_CREDENTIALS = {
    "username": os.getenv('ADMIN_USERNAME'),
    "password": os.getenv('ADMIN_PASSWORD'),
}

# Configurar Gemini
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

# Almacenamiento temporal de datos por usuario
user_data_storage = {}
admin_session = None  # Sesión del admin para consultas a la API
telegram_users_cache = {}  # Cache de telegram_id -> username

def extract_receipt_data_with_gemini(image):
    """Extrae datos del recibo usando Gemini API"""
    
    prompt = """
    Analiza esta imagen de un recibo de restaurante, bar o establecimiento.
    Extrae la siguiente información y devuélvela ÚNICAMENTE en formato JSON válido, sin texto adicional:

    {
        "concepto": "nombre completo del establecimiento (ej: BAR RESTAURANTE DELICIAS)",
        "total": "importe total en formato numérico (ej: 35.85)",
        "fecha": "fecha del ticket en formato DD/MM/YYYY"
    }

    IMPORTANTE:
    - Para "concepto" usa el nombre COMPLETO del establecimiento como aparece en el recibo
    - Para "total" usa SOLO el número, sin símbolo de euro
    - Si no encuentras algún dato, usa "No detectado"
    - Responde SOLO con el JSON, sin explicaciones adicionales
    """
    
    try:
        # Generar contenido con Gemini
        response = model.generate_content([prompt, image])
        
        # Extraer el JSON de la respuesta
        response_text = response.text.strip()
        
        # Limpiar posibles markdown
        if response_text.startswith('```json'):
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif response_text.startswith('```'):
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        # Parsear JSON
        data = json.loads(response_text)
        
        # Validar que tenga los campos necesarios
        required_fields = ['concepto', 'total', 'fecha']
        for field in required_fields:
            if field not in data:
                data[field] = 'No detectado'
        
        return data
        
    except Exception as e:
        print(f"Error al procesar con Gemini: {e}")
        # Devolver estructura por defecto en caso de error
        return {
            'concepto': 'No detectado',
            'total': 'No detectado',
            'fecha': 'No detectado'
        }

def format_data_message(data):
    """Formatea los datos en un mensaje legible"""
    message = "📄 *Datos extraídos del recibo:*\n\n"
    message += f"🏪 *Concepto:* {data['concepto']}\n"
    message += f"💰 *Total:* {data['total']} €\n"
    message += f"📅 *Fecha:* {data['fecha']}\n"
    return message

# ==================== AUTENTICACIÓN JWT ====================
def get_admin_session():
    """Obtiene la sesión del admin para consultas a la API"""
    global admin_session
    
    # Si ya hay sesión, verificar si sigue válida
    if admin_session:
        try:
            response = admin_session.get(f"{API_AUTH_URL}check/")
            if response.status_code == 200:
                return admin_session
        except:
            pass
    
    # Crear nueva sesión
    try:
        session = requests.Session()
        
        # Obtener CSRF token
        session.get(f"{API_BASE_URL}/tickets/login/")
        csrf_token = session.cookies.get('csrftoken', '')
        
        # Hacer login como admin
        response = session.post(
            f"{API_AUTH_URL}login/",
            json={
                "username": ADMIN_CREDENTIALS["username"],
                "password": ADMIN_CREDENTIALS["password"]
            },
            headers={
                "Content-Type": "application/json",
                "X-CSRFToken": csrf_token
            }
        )
        
        if response.status_code == 200:
            admin_session = session
            return session
        else:
            print(f"Error en login admin: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"Error al autenticar admin: {e}")
        return None

def load_telegram_users():
    """Carga todos los usuarios con telegram_id desde la API"""
    global telegram_users_cache
    
    session = get_admin_session()
    if not session:
        print("❌ No se pudo autenticar como admin")
        return False
    
    try:
        response = session.get(f"{API_BASE_URL}/api/telegram/profiles/")
        if response.status_code == 200:
            data = response.json()
            
            # Debug: ver qué devuelve la API
            print(f"DEBUG - Respuesta API: {data}")
            
            # Manejar diferentes formatos de respuesta
            if isinstance(data, dict):
                # Si es un dict con 'results' (paginado)
                profiles = data.get('results', [])
            elif isinstance(data, list):
                # Si es una lista directa
                profiles = data
            else:
                print(f"❌ Formato de respuesta inesperado: {type(data)}")
                return False
            
            telegram_users_cache = {
                profile['telegram_id']: {
                    'username': profile['username'],
                    'email': profile['email'],
                    'has_telegram': profile['has_telegram']
                }
                for profile in profiles if profile.get('telegram_id')
            }
            print(f"✅ Cargados {len(telegram_users_cache)} usuarios con Telegram")
            return True
        else:
            print(f"❌ Error al cargar usuarios: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        import traceback
        print(f"❌ Error al cargar usuarios: {e}")
        print(traceback.format_exc())
        return False

def is_allowed_user(update: Update):
    """Verifica si el usuario está autorizado (tiene telegram_id en la BD)"""
    user_id = update.effective_user.id
    
    # Si no está en cache, recargar usuarios
    if user_id not in telegram_users_cache:
        load_telegram_users()
    
    return user_id in telegram_users_cache

def get_username_by_telegram_id(telegram_id):
    """Obtiene el username asociado a un telegram_id"""
    if telegram_id in telegram_users_cache:
        return telegram_users_cache[telegram_id]['username']
    
    # Intentar recargar cache
    load_telegram_users()
    return telegram_users_cache.get(telegram_id, {}).get('username')


# --- HANDLERS ACTUALIZADOS ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /start"""
    if not is_allowed_user(update):
        await update.message.reply_text("🚫 No tienes permiso para usar este bot.")
        return
    
    await update.message.reply_text(
        "👋 ¡Bienvenido al Bot de Recibos con IA!\n\n"
        "📸 Envíame una foto de un recibo y extraeré sus datos automáticamente usando Gemini AI.\n\n"
        "Luego podrás:\n"
        "✏️ Editar los datos con: `/editar <campo> <valor>`\n"
        "📤 Crear tu ticket con: `/enviar`\n\n"
        "💡 Usa `/help` para ver todos los comandos disponibles.",
        parse_mode='Markdown'
    )


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Maneja las fotos recibidas"""
    if not is_allowed_user(update):
        await update.message.reply_text("🚫 No tienes permiso para usar este bot.")
        return
    
    user_id = update.effective_user.id
    await update.message.reply_text("🤖 Analizando con IA...")
    
    try:
        photo = await update.message.photo[-1].get_file()
        photo_bytes = await photo.download_as_bytearray()
        image = Image.open(io.BytesIO(photo_bytes))
        
        data = extract_receipt_data_with_gemini(image)
        user_data_storage[user_id] = data
        
        message = format_data_message(data)
        await update.message.reply_text(message, parse_mode='Markdown')
        
        await update.message.reply_text(
            "❓ *¿Qué desea realizar?*\n\n"
            "✏️ `/editar <campo> <valor>` - Editar un campo\n"
            "📤 `/enviar` - Crear tu ticket\n\n"
            "*Campos disponibles:*\n"
            "• concepto\n"
            "• total\n"
            "• fecha",
            parse_mode='Markdown'
        )
        
    except Exception as e:
        await update.message.reply_text(
            f"❌ Error al procesar la imagen: {str(e)}\n"
            "Por favor, intenta con otra foto."
        )


async def editar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /editar para modificar campos"""
    if not is_allowed_user(update):
        await update.message.reply_text("🚫 No tienes permiso para usar este bot.")
        return
    
    user_id = update.effective_user.id
    if user_id not in user_data_storage:
        await update.message.reply_text("❌ No hay datos para editar. Primero envía una foto de un recibo.")
        return
    
    if len(context.args) < 2:
        await update.message.reply_text(
            "❌ Formato incorrecto. Usa:\n"
            "`/editar <campo> <valor>`\n\n"
            "Ejemplo: `/editar total 45.50`",
            parse_mode='Markdown'
        )
        return
    
    campo = context.args[0].lower()
    valor = ' '.join(context.args[1:])
    
    campos_validos = ['concepto', 'total', 'fecha']
    if campo not in campos_validos:
        await update.message.reply_text(
            f"❌ Campo '{campo}' no válido.\n\n"
            f"*Campos válidos:* {', '.join(campos_validos)}",
            parse_mode='Markdown'
        )
        return
    
    user_data_storage[user_id][campo] = valor
    
    await update.message.reply_text(f"✅ Campo '{campo}' actualizado correctamente.\n")
    
    message = format_data_message(user_data_storage[user_id])
    await update.message.reply_text(message, parse_mode='Markdown')
    
    await update.message.reply_text(
        "❓ *¿Qué desea realizar?*\n\n"
        "✏️ `/editar <campo> <valor>` - Editar otro campo\n"
        "📤 `/enviar` - Crear tu ticket",
        parse_mode='Markdown'
    )


async def total_mes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /total_mes fecha_ini fecha_fin -> devuelve el total entre fechas del usuario actual"""
    if not is_allowed_user(update):
        await update.message.reply_text("🚫 No tienes permiso para usar este bot.")
        return

    if len(context.args) != 2:
        await update.message.reply_text(
            "❌ Formato incorrecto. Usa:\n"
            "`/total_mes YYYY/MM/DD YYYY/MM/DD`\n\n"
            "Ejemplo: `/total_mes 2025/09/01 2025/09/30`",
            parse_mode="Markdown"
        )
        return

    user_telegram_id = update.effective_user.id
    username = get_username_by_telegram_id(user_telegram_id)
    
    if not username:
        await update.message.reply_text("❌ No se pudo identificar tu usuario.")
        return
    
    # Usar sesión del admin para consultar
    session = get_admin_session()
    if not session:
        await update.message.reply_text("❌ Error de autenticación del sistema.")
        return

    fecha_ini = context.args[0].replace("/", "-")  # convertir 2025/09/01 → 2025-09-01
    fecha_fin = context.args[1].replace("/", "-")

    url = f"{API_TICKETS_URL}total_entre_fechas/?inicio={fecha_ini}&fin={fecha_fin}"

    try:
        response = session.get(url)
        if response.status_code == 200:
            data = response.json()
            await update.message.reply_text(
                f"📊 *Gasto total entre {data['inicio']} y {data['fin']}:*\n\n"
                f"👤 *Usuario:* {username}\n"
                f"💰 {data['total']}",
                parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(
                f"⚠️ Error al consultar el servidor: {response.status_code}\n{response.text}"
            )
    except Exception as e:
        await update.message.reply_text(f"❌ Error de conexión con la API: {e}")

async def enviar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /enviar para crear ticket para el usuario actual"""
    if not is_allowed_user(update):
        await update.message.reply_text("🚫 No tienes permiso para usar este bot.")
        return
    
    user_telegram_id = update.effective_user.id
    
    if user_telegram_id not in user_data_storage:
        await update.message.reply_text("❌ No hay datos para enviar. Primero envía una foto de un recibo.")
        return
    
    # Obtener el username del usuario actual desde el cache
    username = get_username_by_telegram_id(user_telegram_id)
    if not username:
        await update.message.reply_text(
            "❌ No se pudo identificar tu usuario.\n"
            "Asegúrate de tener configurado tu ID de Telegram en la web."
        )
        return
    
    # Obtener sesión del admin para crear el ticket
    session = get_admin_session()
    if not session:
        await update.message.reply_text("❌ Error de autenticación del sistema. Intenta de nuevo.")
        return
    
    # Obtener el user_id desde la API
    try:
        csrf_token = session.cookies.get('csrftoken', '')
        
        # Llamar a la API para obtener los datos completos del usuario
        response = session.get(
            f"{API_BASE_URL}/api/telegram/user/",
            params={"username": username},
            headers={"X-CSRFToken": csrf_token}
        )
        
        if response.status_code != 200:
            await update.message.reply_text(
                f"⚠️ Error al verificar tu usuario: {response.status_code}"
            )
            return
        
        user_data_api = response.json()
        target_user_id = user_data_api.get('user_id')
        
    except Exception as e:
        await update.message.reply_text(f"❌ Error al verificar usuario: {e}")
        return
    
    data = user_data_storage[user_telegram_id]

    # --- convertir fecha a formato ISO ---
    fecha_iso = None
    try:
        fecha_iso = datetime.strptime(data["fecha"], "%d/%m/%Y").isoformat()
    except Exception:
        fecha_iso = datetime.now().isoformat()  # fallback si no se detecta bien

    payload = {
        "titulo": data["concepto"],
        "fecha": fecha_iso,
        "coste": data["total"],
        "moneda": "EUR",
        "usuario": target_user_id  # Asignar al usuario actual
    }

    try:
        response = session.post(
            API_TICKETS_URL,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-CSRFToken": csrf_token
            }
        )
        
        if response.status_code == 201:
            await update.message.reply_text(
                f"✅ Ticket creado correctamente.\n\n"
                f"👤 *Usuario:* {username}\n"
                f"🏪 *Concepto:* {data['concepto']}\n"
                f"💰 *Total:* {data['total']} €\n"
                f"📅 *Fecha:* {data['fecha']}",
                parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(
                f"⚠️ Error al enviar al servidor: {response.status_code}\n{response.text}"
            )
    except Exception as e:
        await update.message.reply_text(f"❌ Error de conexión con la API: {e}")
    
    # limpiar almacenamiento temporal
    del user_data_storage[user_telegram_id]
    

async def reload_users(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /reload para recargar la lista de usuarios desde la API"""
    if not is_allowed_user(update):
        await update.message.reply_text("🚫 No tienes permiso para usar este bot.")
        return
    
    await update.message.reply_text("🔄 Recargando usuarios desde la API...")
    
    if load_telegram_users():
        usernames = [data['username'] for data in telegram_users_cache.values()]
        await update.message.reply_text(
            f"✅ Lista de usuarios actualizada.\n\n"
            f"👥 *Usuarios autorizados:* {len(telegram_users_cache)}\n\n"
            f"Usuarios: {', '.join(usernames)}",
            parse_mode='Markdown'
        )
    else:
        await update.message.reply_text("❌ Error al recargar usuarios.")

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Comando /help que lista los comandos disponibles"""
    if not is_allowed_user(update):
        await update.message.reply_text("🚫 No tienes permiso para usar este bot.")
        return

    user_telegram_id = update.effective_user.id
    username = get_username_by_telegram_id(user_telegram_id)
    
    help_text = (
        f"📋 *Comandos disponibles:*\n\n"
        f"👤 *Usuario:* {username}\n\n"
        "• */start* - Inicia el bot y muestra instrucciones básicas.\n"
        "• */help* - Muestra esta lista de comandos.\n"
        "• */editar <campo> <valor>* - Edita un campo del último recibo procesado.\n"
        "  Campos disponibles: concepto, total, fecha\n"
        "• */enviar* - Crea un ticket con los datos del recibo.\n"
        "• */total_mes <fecha_ini> <fecha_fin>* - Devuelve el total gastado entre dos fechas (formato YYYY/MM/DD).\n"
        "• */reload* - Recarga la lista de usuarios autorizados.\n\n"
        "📸 También puedes enviarme una foto de un recibo y el bot extraerá automáticamente los datos usando IA."
    )
    await update.message.reply_text(help_text, parse_mode='Markdown')
    
def main():
    """Función principal"""
    # Cargar usuarios al iniciar
    print("🔄 Cargando usuarios desde la API...")
    if load_telegram_users():
        print(f"✅ Bot listo. {len(telegram_users_cache)} usuarios autorizados.")
    else:
        print("⚠️ No se pudieron cargar usuarios. El bot puede no funcionar correctamente.")
    
    # Crear aplicación
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    
    # Registrar handlers
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("editar", editar))
    app.add_handler(CommandHandler("enviar", enviar))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(CommandHandler("total_mes", total_mes))
    app.add_handler(CommandHandler("reload", reload_users))
    app.add_handler(CommandHandler("help", help_command))

    
    # Iniciar bot
    print("🤖 Bot con Gemini AI iniciado...")
    app.run_polling()

if __name__ == '__main__':
    main()