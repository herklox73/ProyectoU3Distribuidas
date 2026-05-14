<?php
session_start();
header('Content-Type: application/json');
error_reporting(0);

require_once 'config.php';

$objSql = new cSql;

// Recibir IDs de mensajes a consultar
$input = json_decode(file_get_contents('php://input'), true);
$ids   = isset($input['message_ids']) ? $input['message_ids'] : [];

if (empty($ids) || !is_array($ids)) {
    echo json_encode(['updates' => []]);
    exit;
}

// Sanitizar: solo enteros positivos
$sanitized = array_filter(array_map('intval', $ids), function($id) { return $id > 0; });

if (empty($sanitized)) {
    echo json_encode(['updates' => []]);
    exit;
}

$ids_list = implode(',', $sanitized);

$sql = "SELECT id, status FROM fm_crm_whatsapp_messages
        WHERE id IN ({$ids_list})
        AND direction = 'outbound'";

$result = $objSql->consulta($sql, "NO HISTORIAL");

$updates = [];

if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        $updates[] = [
            'id'     => intval($row['id']),
            'status' => $row['status']
        ];
    }
}

echo json_encode(['updates' => $updates], JSON_UNESCAPED_UNICODE);
?>
