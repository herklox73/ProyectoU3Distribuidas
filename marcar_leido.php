<?php
session_start();
header('Content-Type: application/json');


$objSql = new cSql;

$objEncrip = new cEncriptacion();
require_once("../../../clases/cParametros.php");
$objParam = new cParametros();
$digitador = $objEncrip->decrypt($_SESSION[$objParam->p_nombres_session]);
$digitador_safe = addslashes($digitador);

// Recibir datos
$input = json_decode(file_get_contents('php://input'), true);
$phoneNumber = isset($input['phone_number']) ? addslashes($input['phone_number']) : '';

if (empty($phoneNumber)) {
    echo json_encode(['success' => false, 'error' => 'phone_number requerido']);
    exit;
}

// Obtener cuenta activa de la empresa para saber el phone_number_id
// No filtramos por usuario: todos los de la empresa comparten la misma BD
$sqlAccount = "SELECT phone_number_id 
               FROM fm_crm_whatsapp_accounts 
               WHERE is_active = 1 
               LIMIT 1";

$resultAccount = $objSql->consulta($sqlAccount, "NO HISTORIAL");

if (!$resultAccount || $resultAccount->num_rows == 0) {
    echo json_encode(['success' => false, 'error' => 'No hay cuenta activa para esta empresa']);
    exit;
}

$account = $resultAccount->fetch_assoc();
$phoneNumberId_safe = addslashes($account['phone_number_id']);

// Marcar todos los mensajes inbound de esta conversación como leídos
$sqlUpdate = "UPDATE fm_crm_whatsapp_messages 
              SET is_read = 1 
              WHERE phone_number_id = '{$phoneNumberId_safe}'
              AND phone_number = '{$phoneNumber}'
              AND direction = 'inbound'
              AND is_read = 0";

$objSql->consulta($sqlUpdate, "NO HISTORIAL");

echo json_encode(['success' => true]);
?>
