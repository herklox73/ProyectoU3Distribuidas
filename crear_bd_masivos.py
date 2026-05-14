import mysql.connector
from mysql.connector import Error

def create_database():
    try:
        # Conexión inicial sin especificar base de datos para poder crearla
        connection = mysql.connector.connect(
            host='localhost',
            user='root',
            password='car73h' # Cambia esto si tu root tiene contraseña
        )
        
        if connection.is_connected():
            cursor = connection.cursor()
            
            # Crear la base de datos
            cursor.execute("CREATE DATABASE IF NOT EXISTS mass_sending_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            print("✅ Base de datos 'mass_sending_db' creada o ya existía.")
            
            # Usar la base de datos
            cursor.execute("USE mass_sending_db")
            
            # 1. Tabla de Proveedores API (Antes: fm_crm_whatsapp_accounts)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_providers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone_number_id VARCHAR(100) NOT NULL UNIQUE,
                waba_id VARCHAR(100),
                display_number VARCHAR(50),
                business_name VARCHAR(150),
                access_token TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """)
            print("✅ Tabla 'api_providers' creada.")

            # 2. Tabla de Contactos (Directorio)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS contacts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone_number VARCHAR(50) NOT NULL UNIQUE,
                full_name VARCHAR(150),
                tags VARCHAR(255) COMMENT 'Para segmentar (ej: clientes, leads, morosos)',
                custom_data JSON COMMENT 'Datos extra dinámicos',
                is_opted_out BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """)
            print("✅ Tabla 'contacts' creada.")

            # 3. Tabla de Campañas de Envío Masivo
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS campaigns (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                message_template TEXT NOT NULL,
                media_url VARCHAR(255),
                status ENUM('draft', 'scheduled', 'running', 'completed', 'cancelled') DEFAULT 'draft',
                scheduled_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """)
            print("✅ Tabla 'campaigns' creada.")

            # 4. Tabla de Mensajes Enviados (Antes: fm_crm_whatsapp_messages)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                provider_id INT,
                campaign_id INT NULL,
                phone_number VARCHAR(50) NOT NULL,
                direction ENUM('inbound', 'outbound') NOT NULL,
                message_type VARCHAR(50) DEFAULT 'text',
                content TEXT,
                delivery_status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
                error_log TEXT,
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (provider_id) REFERENCES api_providers(id) ON DELETE SET NULL,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
            )
            """)
            print("✅ Tabla 'messages' creada.")

            print("\n🎉 ¡Base de datos y tablas creadas con éxito usando Python!")
            
    except Error as e:
        print(f"❌ Error al conectar a MySQL: {e}")
    finally:
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()
            print("🔌 Conexión cerrada.")

if __name__ == '__main__':
    create_database()
