<?php

@session_start();

// ============================================
// CONFIGURACIÓN DE BASE DE DATOS MASSSEND
// ============================================
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'mass_send_demo');

class cSql {
    private $conn;

    public function __construct() {
        $this->conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        if ($this->conn->connect_error) {
            // No morir, solo manejar error silencioso para el demo
            // die("Connection failed: " . $this->conn->connect_error);
        } else {
            $this->conn->set_charset("utf8mb4");
        }
    }

    public function consulta($sql, $historial = "") {
        if (!$this->conn || $this->conn->connect_error) {
            // Simulamos un objeto mysqli_result vacío si no hay conexión
            return new class {
                public $num_rows = 0;
                public function fetch_assoc() { return null; }
            };
        }
        $result = $this->conn->query($sql);
        if ($result === true) {
            return true;
        } else if ($result) {
            return $result;
        } else {
            // Simulamos un objeto vacío si falla la query
            return new class {
                public $num_rows = 0;
                public function fetch_assoc() { return null; }
            };
        }
    }
}

// Simulamos clases de Idrix que ya no existen
class cEncriptacion {
    public function decrypt($str) { return "demo_user"; }
    public function encrypt($str) { return $str; }
}

class cParametros {
    public $p_nombres_session = 'session_name';
}

$objSql = new cSql();
$objEncrip = new cEncriptacion();
$objParam = new cParametros();

$_SESSION[$objParam->p_nombres_session] = "demo_user";
$digitador = "demo_user";

$objSqlWhatsApp = new cSql();

// ============================================
// CONFIGURACIÓN DE API EXTERNA (NUEVAS VARIABLES)
// ============================================
define('API_BASE_URL', 'https://api.tu-proveedor.com/v1/');
define('API_AUTH_TOKEN', 'AQUI_TU_NUEVO_TOKEN');

// ============================================
// FUNCIONES DE GESTIÓN DE CUENTAS
// ============================================

/**
 * Obtener LA cuenta del usuario (solo una activa)
 */
function getWhatsAppAccountByUser($usuario) {
    global $objSqlWhatsApp;
    
    // Ya no filtramos por usuario, todos en la empresa comparten la misma BD
    $sql = "SELECT * FROM fm_crm_whatsapp_accounts
            WHERE is_active = 1 
            LIMIT 1";
    
    $consulta = $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
    
    if ($consulta && $consulta->num_rows > 0) {
        return $consulta->fetch_assoc();
    }
    
    return null;
}

/**
 * Obtener cuenta por Phone Number ID (usado en webhooks)
 */
function getWhatsAppAccountById($phoneNumberId) {
    global $objSqlWhatsApp;
    
    $phoneNumberId_safe = addslashes($phoneNumberId);
    
    $sql = "SELECT * FROM fm_crm_whatsapp_accounts 
            WHERE phone_number_id = '{$phoneNumberId_safe}' 
            AND is_active = 1 
            LIMIT 1";
    
    $consulta = $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
    
    if ($consulta && $consulta->num_rows > 0) {
        return $consulta->fetch_assoc();
    }
    
    return null;
}

/**
 * Obtener cuenta por ID interno
 */
function getWhatsAppAccountByInternalId($accountId) {
    global $objSqlWhatsApp;
    
    $accountId = (int)$accountId;
    
    $sql = "SELECT * FROM fm_crm_whatsapp_accounts 
            WHERE id = {$accountId} 
            AND is_active = 1 
            LIMIT 1";
    
    $consulta = $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
    
    if ($consulta && $consulta->num_rows > 0) {
        return $consulta->fetch_assoc();
    }
    
    return null;
}

/**
 * Cargar configuración completa lista para usar
 */
function loadWhatsAppConfig($accountId) {
    $account = getWhatsAppAccountByInternalId($accountId);
    
    if (!$account) {
        return null;
    }
    
    return [
        'account_id' => $account['id'],
        'phone_number_id' => $account['phone_number_id'], // REAL del cliente
        'waba_id' => $account['waba_id'],                 // REAL del cliente
        'display_number' => $account['display_number'],
        'business_name' => $account['business_name'],
        'token' => API_AUTH_TOKEN,
        'connected_by' => $account['connected_by']
    ];
}

/**
 * Cargar por Phone Number ID (para webhooks)
 */
function loadWhatsAppConfigByPhoneId($phoneNumberId) {
    $account = getWhatsAppAccountById($phoneNumberId);
    
    if (!$account) {
        return null;
    }
    
    return [
        'account_id' => $account['id'],
        'phone_id' => $account['phone_number_id'],
        'waba_id' => $account['waba_id'],
        'display_number' => $account['display_number'],
        'business_name' => $account['business_name'],
        'token' => API_AUTH_TOKEN
    ];
}

// ============================================
// CONVERSACIONES Y MENSAJES
// ============================================

function getOrCreateConversation($whatsappAccountId, $customerPhone, $customerName = null) {
    global $objSqlWhatsApp;
    
    $customerPhone = preg_replace('/[^0-9]/', '', $customerPhone);
    
    $sql = "SELECT id FROM conversations 
            WHERE whatsapp_account_id = {$whatsappAccountId} 
            AND customer_phone = '{$customerPhone}'";
    
    $consulta = $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
    
    if ($consulta && $consulta->num_rows > 0) {
        $resultado = $consulta->fetch_assoc();
        return $resultado['id'];
    }
    
    $customerNameEscaped = $customerName ? "'" . addslashes($customerName) . "'" : "NULL";
    
    $sql = "INSERT INTO conversations (
                whatsapp_account_id, 
                customer_phone, 
                customer_name,
                status,
                created_at
            ) VALUES (
                {$whatsappAccountId},
                '{$customerPhone}',
                {$customerNameEscaped},
                'open',
                NOW()
            )";
    
    $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
    
    $sql = "SELECT LAST_INSERT_ID() as id";
    $consulta = $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
    $resultado = $consulta->fetch_assoc();
    
    return $resultado['id'];
}

function saveMessage($data) {
    global $objSqlWhatsApp;
    
    $conversationId = (int)$data['conversation_id'];
    $whatsappAccountId = (int)$data['whatsapp_account_id'];
    $messageId = isset($data['message_id']) ? "'" . addslashes($data['message_id']) . "'" : "NULL";
    $direction = addslashes($data['direction']);
    $fromNumber = addslashes($data['from_number']);
    $toNumber = addslashes($data['to_number']);
    $messageType = isset($data['message_type']) ? addslashes($data['message_type']) : 'text';
    $content = addslashes($data['content']);
    $mediaUrl = isset($data['media_url']) ? "'" . addslashes($data['media_url']) . "'" : "NULL";
    $mediaMimeType = isset($data['media_mime_type']) ? "'" . addslashes($data['media_mime_type']) . "'" : "NULL";
    $templateName = isset($data['template_name']) ? "'" . addslashes($data['template_name']) . "'" : "NULL";
    $status = isset($data['status']) ? addslashes($data['status']) : 'pending';
    $timestamp = isset($data['timestamp']) ? (int)$data['timestamp'] : time();
    
    $sql = "INSERT INTO messages (
                conversation_id, whatsapp_account_id, message_id, direction,
                from_number, to_number, message_type, content, media_url,
                media_mime_type, template_name, status, timestamp, created_at
            ) VALUES (
                {$conversationId}, {$whatsappAccountId}, {$messageId}, '{$direction}',
                '{$fromNumber}', '{$toNumber}', '{$messageType}', '{$content}', {$mediaUrl},
                {$mediaMimeType}, {$templateName}, '{$status}', {$timestamp}, NOW()
            )";
    
    $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
    
    $sql = "SELECT LAST_INSERT_ID() as id";
    $consulta = $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
    $resultado = $consulta->fetch_assoc();
    $messageInsertId = $resultado['id'];
    
    updateConversationLastMessage($conversationId, $data['content']);
    
    return $messageInsertId;
}

function updateConversationLastMessage($conversationId, $messagePreview) {
    global $objSqlWhatsApp;
    
    $preview = mb_substr($messagePreview, 0, 100);
    $preview = addslashes($preview);
    
    $sql = "UPDATE conversations 
            SET last_message_at = NOW(),
                last_message_preview = '{$preview}',
                updated_at = NOW()
            WHERE id = {$conversationId}";
    
    return $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
}

function updateMessageStatus($messageId, $status) {
    global $objSqlWhatsApp;
    
    $messageId_safe = addslashes($messageId);
    $status_safe = addslashes($status);
    
    $sql = "UPDATE messages 
            SET status = '{$status_safe}', updated_at = NOW() 
            WHERE message_id = '{$messageId_safe}'";
    
    return $objSqlWhatsApp->consulta($sql, "NO HISTORIAL");
}

// ============================================
// UTILIDADES
// ============================================

function cleanPhoneNumber($phone) {
    return preg_replace('/[^0-9]/', '', $phone);
}

function formatPhoneForWhatsApp($phone) {
    $clean = cleanPhoneNumber($phone);
    if (strlen($clean) === 9 && substr($clean, 0, 1) === '9') {
        $clean = '593' . $clean;
    }
    return $clean;
}

function configuracionesWhatsAppValidas($token, $phoneId) {
    if ($token === null || $phoneId === null) {
        return false;
    }
    return !empty(trim($token)) && !empty(trim($phoneId));
}

// ============================================
// INICIALIZACIÓN: CARGAR CUENTA DEL USUARIO
// ============================================

$whatsappToken = API_AUTH_TOKEN;

// Cargar LA cuenta del usuario (solo una)
$whatsappAccount = getWhatsAppAccountByUser($digitador);

if ($whatsappAccount) {
    // Usuario YA conectó su WhatsApp
    $whatsappPhoneId = $whatsappAccount['phone_number_id'];
    $whatsappNumber = $whatsappAccount['display_number'];
    $wabaId = $whatsappAccount['waba_id'];
    $whatsappAccountId = $whatsappAccount['id'];
    $whatsappBusinessName = $whatsappAccount['business_name'];
    
    // Guardar en sesión (opcional, para UI)
    $_SESSION['whatsapp_phone_id'] = $whatsappPhoneId;
    $_SESSION['whatsapp_number'] = $whatsappNumber;
    $_SESSION['whatsapp_waba_id'] = $wabaId;
    $_SESSION['whatsapp_account_id'] = $whatsappAccountId;
    $_SESSION['whatsapp_business_name'] = $whatsappBusinessName;
    $_SESSION['whatsapp_token'] = $whatsappToken;
    $_SESSION['whatsapp_connected'] = true;
    
} else {
    // Usuario NO tiene WhatsApp conectado
    $whatsappPhoneId = null;
    $whatsappNumber = null;
    $wabaId = null;
    $whatsappAccountId = null;
    $whatsappBusinessName = null;
    
    $_SESSION['whatsapp_connected'] = false;
}

?>