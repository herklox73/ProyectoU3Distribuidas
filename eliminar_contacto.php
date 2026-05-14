<?php
session_start();
header('Content-Type: application/json');


$input = json_decode(file_get_contents('php://input'), true);
$phone = preg_replace('/[^0-9]/', '', $input['phone_number'] ?? '');

if (empty($phone)) {
    echo json_encode(['success' => false, 'error' => 'phone_number requerido']);
    exit;
}

$phone_safe = addslashes($phone);

$sql = "UPDATE fm_crm_whatsapp_contacts 
        SET custom_name = NULL, wa_name = NULL, updated_at = NOW()
        WHERE phone_number = '{$phone_safe}'";

$objSql->consulta($sql, "NO HISTORIAL");

echo json_encode(['success' => true]);
?>
