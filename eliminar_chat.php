<?php
session_start();
header('Content-Type: application/json');


$objSql = new cSql;

// ============================================
// FUNCIÓN DE LOGGING
// ============================================
function log_debug($msg) {
    @file_put_contents(__DIR__ . '/eliminar_chat_debug.log', 
        date('Y-m-d H:i:s') . " - " . $msg . "\n", 
        FILE_APPEND);
}

log_debug("========================================");
log_debug("ELIMINAR CHAT - INICIO");

// ============================================
// OBTENER USUARIO ACTUAL
// ============================================
$objEncrip = new cEncriptacion();
require_once("../../../clases/cParametros.php");
$objParam = new cParametros();
$digitador = $objEncrip->decrypt($_SESSION[$objParam->p_nombres_session]);
$digitador_safe = addslashes($digitador);

log_debug("Usuario: {$digitador}");

// ============================================
// LEER DATOS DEL POST
// ============================================
$rawInput = file_get_contents('php://input');
log_debug("Raw input: {$rawInput}");

$input = json_decode($rawInput, true);
$phoneNumber = $input['phone_number'] ?? '';

log_debug("Phone number recibido: '{$phoneNumber}'");

if (empty($phoneNumber)) {
    log_debug("ERROR: Número de teléfono vacío");
    echo json_encode([
        'success' => false, 
        'message' => 'Número de teléfono no proporcionado'
    ]);
    exit;
}

$phoneNumber_safe = addslashes($phoneNumber);

// ============================================
// 1. VERIFICAR QUE LA EMPRESA TIENE UNA CUENTA ACTIVA
// ============================================
$sqlAccount = "SELECT id, phone_number_id 
               FROM fm_crm_whatsapp_accounts 
               WHERE is_active = 1 
               LIMIT 1";

log_debug("SQL cuenta: {$sqlAccount}");

$resultAccount = $objSql->consulta($sqlAccount, "NO HISTORIAL");

if (!$resultAccount || $resultAccount->num_rows == 0) {
    log_debug("ERROR: No se encontró cuenta activa");
    echo json_encode([
        'success' => false, 
        'message' => 'No se encontró cuenta activa'
    ]);
    exit;
}

$account = $resultAccount->fetch_assoc();
$phoneNumberId = $account['phone_number_id'];
$phoneNumberId_safe = addslashes($phoneNumberId);

log_debug("Cuenta encontrada - phone_number_id: {$phoneNumberId}");

// ============================================
// 2. VERIFICAR CUÁNTOS MENSAJES EXISTEN
// ============================================
$sqlCount = "SELECT COUNT(*) as total 
             FROM fm_crm_whatsapp_messages 
             WHERE phone_number_id = '{$phoneNumberId_safe}' 
             AND phone_number = '{$phoneNumber_safe}'";

log_debug("SQL count: {$sqlCount}");

$resultCount = $objSql->consulta($sqlCount, "NO HISTORIAL");

if ($resultCount) {
    $row = $resultCount->fetch_assoc();
    $totalMensajes = $row['total'];
    log_debug("Mensajes a eliminar: {$totalMensajes}");
    
    if ($totalMensajes == 0) {
        log_debug("ADVERTENCIA: No hay mensajes para eliminar");
        echo json_encode([
            'success' => false, 
            'message' => 'No se encontraron mensajes para este chat',
            'mensajes_encontrados' => 0
        ]);
        exit;
    }
} else {
    log_debug("ERROR: No se pudo contar mensajes");
}

// ============================================
// 3. ELIMINAR MENSAJES DE ESTA CONVERSACIÓN
// ============================================
$sqlDelete = "DELETE FROM fm_crm_whatsapp_messages 
              WHERE phone_number_id = '{$phoneNumberId_safe}' 
              AND phone_number = '{$phoneNumber_safe}'";

log_debug("SQL delete: {$sqlDelete}");

$resultado = $objSql->consulta($sqlDelete, "NO HISTORIAL");

log_debug("Resultado de consulta: " . ($resultado ? 'true' : 'false'));

// ============================================
// 4. VERIFICAR SI SE ELIMINÓ - CONTAR MENSAJES RESTANTES
// ============================================
// En lugar de usar affected_rows (que puede fallar), verificamos si realmente se eliminó
$sqlVerify = "SELECT COUNT(*) as restantes 
              FROM fm_crm_whatsapp_messages 
              WHERE phone_number_id = '{$phoneNumberId_safe}' 
              AND phone_number = '{$phoneNumber_safe}'";

log_debug("SQL verify: {$sqlVerify}");

$resultVerify = $objSql->consulta($sqlVerify, "NO HISTORIAL");

if ($resultVerify) {
    $rowVerify = $resultVerify->fetch_assoc();
    $mensajesRestantes = $rowVerify['restantes'];
    log_debug("Mensajes restantes después de DELETE: {$mensajesRestantes}");
    
    if ($mensajesRestantes == 0) {
        // ✅ Se eliminaron todos los mensajes correctamente
        $mensajesEliminados = $totalMensajes; // Sabemos cuántos eran
        log_debug("SUCCESS: Chat eliminado - {$mensajesEliminados} mensajes eliminados");
        log_debug("========================================");
        
        echo json_encode([
            'success' => true, 
            'message' => 'Chat eliminado correctamente',
            'mensajes_eliminados' => $mensajesEliminados
        ]);
    } else {
        // ⚠️ Aún quedan mensajes - el DELETE falló parcialmente
        log_debug("ERROR: DELETE falló - Quedan {$mensajesRestantes} mensajes");
        log_debug("========================================");
        
        echo json_encode([
            'success' => false, 
            'message' => 'Error parcial al eliminar (quedaron ' . $mensajesRestantes . ' mensajes)'
        ]);
    }
} else {
    log_debug("ERROR: No se pudo verificar eliminación");
    log_debug("========================================");
    
    // Como no podemos verificar, asumimos éxito si el DELETE no dio error
    if ($resultado !== false) {
        echo json_encode([
            'success' => true, 
            'message' => 'Chat eliminado correctamente',
            'mensajes_eliminados' => $totalMensajes
        ]);
    } else {
        echo json_encode([
            'success' => false, 
            'message' => 'Error al eliminar el chat'
        ]);
    }
}
?>
