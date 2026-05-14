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
$phoneNumber  = isset($input['phone_number']) ? preg_replace('/[^0-9]/', '', $input['phone_number']) : '';
$customName   = isset($input['custom_name'])  ? trim($input['custom_name']) : '';

if (empty($phoneNumber)) {
    echo json_encode(['success' => false, 'error' => 'phone_number requerido']);
    exit;
}

if (empty($customName)) {
    echo json_encode(['success' => false, 'error' => 'custom_name requerido']);
    exit;
}

$phone_safe  = addslashes($phoneNumber);
$nombre_safe = addslashes($customName);

// Verificar que el contacto existe
$sqlCheck = "SELECT id FROM fm_crm_whatsapp_contacts 
             WHERE phone_number = '{$phone_safe}' 
             LIMIT 1";

$resultCheck = $objSql->consulta($sqlCheck, "NO HISTORIAL");

if (!$resultCheck || $resultCheck->num_rows == 0) {
    echo json_encode(['success' => false, 'error' => 'Contacto no encontrado']);
    exit;
}

// Actualizar el nombre personalizado
$sqlUpdate = "UPDATE fm_crm_whatsapp_contacts 
              SET custom_name = '{$nombre_safe}',
                  updated_at  = NOW()
              WHERE phone_number = '{$phone_safe}'";

$objSql->consulta($sqlUpdate, "NO HISTORIAL");

echo json_encode(['success' => true, 'message' => 'Contacto actualizado correctamente']);
?>
