import requests

def enviar_mensaje_masivo(numero, mensaje):
    url = "http://localhost:3001/api/send"
    payload = {
        "number": numero,
        "message": mensaje
    }
    headers = {"Content-Type": "application/json"}

    print(f"\n🚀 Enviando mensaje a {numero}...")
    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code == 200:
            print("✅ ¡Mensaje enviado exitosamente a tu celular!")
        else:
            print("❌ Error al enviar:", response.text)
    except Exception as e:
        print("❌ Error de conexión. ¿Seguro que el servidor Node.js está corriendo?", e)

if __name__ == "__main__":
    print("\n--- 🧪 PRUEBA DE ENVÍO POR WHATSAPP ---")
    tu_numero = input("👉 Ingresa tu número de celular (con código de país, ej: 59399...): ")
    tu_mensaje = input("👉 Escribe un mensaje de prueba: ")
    
    enviar_mensaje_masivo(tu_numero, tu_mensaje)

