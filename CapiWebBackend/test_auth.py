#!/usr/bin/env python
"""
Script para probar el sistema de autenticación
"""
import requests

BASE_URL = "http://localhost:8000"

print("🧪 Probando sistema de autenticación...\n")

# 1. Intentar acceder a /tickets sin autenticación
print("1️⃣ Accediendo a /tickets/ sin autenticación...")
response = requests.get(f"{BASE_URL}/tickets/", allow_redirects=False)
print(f"   Status: {response.status_code}")
print(f"   Contenido incluye 'loadingScreen': {'loadingScreen' in response.text}")
print(f"   Contenido incluye 'checkAuth': {'checkAuth' in response.text}\n")

# 2. Verificar endpoint de check auth sin token
print("2️⃣ Verificando /api/auth/check/ sin token...")
response = requests.get(f"{BASE_URL}/api/auth/check/")
print(f"   Status: {response.status_code}")
print(f"   Respuesta: {response.text[:100]}\n")

# 3. Intentar login
print("3️⃣ Intentando login con usuario 'admin'...")
session = requests.Session()

# Primero obtener el token CSRF
session.get(f"{BASE_URL}/tickets/login/")
csrf_token = session.cookies.get('csrftoken', '')

response = session.post(
    f"{BASE_URL}/api/auth/login/",
    json={"username": "admin", "password": "admin"},
    headers={
        "Content-Type": "application/json",
        "X-CSRFToken": csrf_token
    }
)
print(f"   Status: {response.status_code}")
if response.status_code == 200:
    print(f"   Respuesta: {response.json()}")
else:
    print(f"   Error: {response.text[:200]}")
print(f"   Cookies: {list(session.cookies.keys())}\n")

# 4. Verificar auth con token
if response.status_code == 200:
    print("4️⃣ Verificando autenticación con token...")
    response = session.get(f"{BASE_URL}/api/auth/check/")
    print(f"   Status: {response.status_code}")
    print(f"   Respuesta: {response.json()}\n")
    
    # 5. Obtener tickets
    print("5️⃣ Obteniendo tickets del usuario...")
    response = session.get(f"{BASE_URL}/api/tickets/")
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Tickets encontrados: {data.get('count', len(data.get('results', [])))}")
    else:
        print(f"   Error: {response.text[:100]}")

print("\n✅ Pruebas completadas")
