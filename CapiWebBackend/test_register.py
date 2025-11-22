#!/usr/bin/env python
"""
Script para probar el registro con contraseñas simples
"""
import requests

BASE_URL = "http://localhost:8000"

print("🧪 Probando registro con diferentes contraseñas...\n")

test_cases = [
    ("user1", "1", "Contraseña muy débil (solo 1 carácter)"),
    ("user2", "abc", "Contraseña débil (3 caracteres)"),
    ("user3", "password", "Contraseña media (8 caracteres)"),
    ("user4", "MyP@ssw0rd123", "Contraseña fuerte"),
]

for username, password, description in test_cases:
    print(f"📝 Probando: {description}")
    print(f"   Usuario: {username}, Contraseña: '{password}'")
    
    session = requests.Session()
    
    # Obtener CSRF token
    session.get(f"{BASE_URL}/tickets/register/")
    csrf_token = session.cookies.get('csrftoken', '')
    
    # Intentar registro
    response = session.post(
        f"{BASE_URL}/api/auth/register/",
        json={"username": username, "password": password, "email": f"{username}@test.com"},
        headers={
            "Content-Type": "application/json",
            "X-CSRFToken": csrf_token
        }
    )
    
    if response.status_code == 201:
        print(f"   ✅ Registro exitoso")
        print(f"   Cookies: {list(session.cookies.keys())}")
    else:
        print(f"   ❌ Error: {response.json().get('error', 'Error desconocido')}")
    
    print()

print("✅ Pruebas completadas")
