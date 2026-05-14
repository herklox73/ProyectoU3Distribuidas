<?php
session_start();

// Datos extraídos de tu lógica de sesión actual
$phone_id = $_SESSION['whatsapp_phone_id'] ?? null;
$token = $_SESSION['whatsapp_token'] ?? null;

if (!$phone_id || !$token) {
    echo json_encode(['error' => 'No hay sesión activa de WhatsApp']);
    exit;
}

// 1. Consultar el About (Info) y Descripción
$profileUrl = API_BASE_URL . "{$phone_id}/whatsapp_business_profile?fields=about,profile_picture_url";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $profileUrl);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
curl_close($ch);

// Enviamos la respuesta directamente al frontend
header('Content-Type: application/json');
echo $response;
?>