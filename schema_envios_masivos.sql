-- ============================================
-- BASE DE DATOS: ENVÍOS MASIVOS (STANDALONE)
-- ============================================
CREATE DATABASE IF NOT EXISTS `mass_send_demo` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `mass_send_demo`;

-- 1. Tabla de Cuentas del Proveedor (WhatsApp / API)
CREATE TABLE IF NOT EXISTS `fm_crm_whatsapp_accounts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `phone_number_id` VARCHAR(100) NOT NULL,
    `waba_id` VARCHAR(100),
    `display_number` VARCHAR(50),
    `business_name` VARCHAR(150),
    `access_token` TEXT,
    `connected_by` VARCHAR(100),
    `is_active` TINYINT(1) DEFAULT 1,
    `verification_status` VARCHAR(50) DEFAULT 'unverified',
    `verified_at` DATETIME NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `idx_phone_number` (`phone_number_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Contactos / Directorio
CREATE TABLE IF NOT EXISTS `contacts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `phone_number` VARCHAR(50) NOT NULL,
    `name` VARCHAR(150),
    `tags` VARCHAR(255) COMMENT 'Etiquetas separadas por comas para segmentar masivos',
    `custom_data` JSON COMMENT 'Variables adicionales para personalizar mensajes',
    `is_opted_out` TINYINT(1) DEFAULT 0 COMMENT '1 si el usuario pidió no recibir mensajes',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `idx_contact_phone` (`phone_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Campañas de Envío Masivo
CREATE TABLE IF NOT EXISTS `campaigns` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(150) NOT NULL,
    `message_template` TEXT NOT NULL COMMENT 'Plantilla del mensaje con variables como {{nombre}}',
    `media_url` VARCHAR(255) NULL COMMENT 'Si la campaña incluye una imagen o archivo',
    `status` ENUM('draft', 'scheduled', 'running', 'completed', 'cancelled') DEFAULT 'draft',
    `scheduled_at` DATETIME NULL,
    `created_by` VARCHAR(100),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de Mensajes (Historial e individual del masivo)
CREATE TABLE IF NOT EXISTS `fm_crm_whatsapp_messages` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `whatsapp_account_id` INT,
    `campaign_id` INT NULL COMMENT 'Nulo si es un mensaje suelto, con ID si es de masivo',
    `phone_number_id` VARCHAR(100),
    `message_id` VARCHAR(150),
    `phone_number` VARCHAR(50) NOT NULL,
    `direction` ENUM('inbound', 'outbound') NOT NULL,
    `message_type` VARCHAR(50) DEFAULT 'text',
    `text_body` TEXT,
    `media_url` VARCHAR(255),
    `media_filename` VARCHAR(150),
    `media_caption` TEXT,
    `media_mime_type` VARCHAR(100),
    `status` ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
    `error_log` TEXT NULL COMMENT 'Razón del fallo si falló el envío',
    `sent_by` VARCHAR(100),
    `message_timestamp` INT(11),
    `message_date` DATETIME,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_account` FOREIGN KEY (`whatsapp_account_id`) REFERENCES `fm_crm_whatsapp_accounts`(`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla de Conversaciones (Opcional, útil para vista de chat si responden al masivo)
CREATE TABLE IF NOT EXISTS `conversations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `whatsapp_account_id` INT,
    `customer_phone` VARCHAR(50) NOT NULL,
    `customer_name` VARCHAR(150),
    `last_message_at` DATETIME,
    `last_message_preview` TEXT,
    `status` ENUM('open', 'closed', 'archived') DEFAULT 'open',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `idx_conversation` (`whatsapp_account_id`, `customer_phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
