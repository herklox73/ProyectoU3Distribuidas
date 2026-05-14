<?php
session_start();
header('Content-Type: application/json');
error_reporting(0);

require_once 'config.php';
$objSql = new cSql;

$desde = isset($_GET['desde']) ? $_GET['desde'] : date('Y-m-d', strtotime('-30 days'));
$hasta = isset($_GET['hasta']) ? $_GET['hasta'] : date('Y-m-d');

// Sanitizar fechas
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde)) $desde = date('Y-m-d', strtotime('-30 days'));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $hasta)) $hasta = date('Y-m-d');

$desde_safe = addslashes($desde);
$hasta_safe  = addslashes($hasta);

// ============================================
// 1. RESUMEN GENERAL
// ============================================
$sqlResumen = "SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) AS enviados,
    SUM(CASE WHEN direction='inbound'  THEN 1 ELSE 0 END) AS recibidos,
    SUM(CASE WHEN direction='outbound' AND status='sent'      THEN 1 ELSE 0 END) AS st_sent,
    SUM(CASE WHEN direction='outbound' AND status='delivered' THEN 1 ELSE 0 END) AS st_delivered,
    SUM(CASE WHEN direction='outbound' AND status='read'      THEN 1 ELSE 0 END) AS st_read,
    SUM(CASE WHEN direction='outbound' AND status='failed'    THEN 1 ELSE 0 END) AS st_failed,
    SUM(CASE WHEN direction='outbound' AND status='pending'   THEN 1 ELSE 0 END) AS st_pending
FROM fm_crm_whatsapp_messages
WHERE DATE(message_date) BETWEEN '{$desde_safe}' AND '{$hasta_safe}'";

$rResumen = $objSql->consulta($sqlResumen, "NO HISTORIAL");
$resumen  = $rResumen ? $rResumen->fetch_assoc() : [];

$enviados   = intval($resumen['enviados']   ?? 0);
$entregados = intval($resumen['st_delivered'] ?? 0);
$leidos     = intval($resumen['st_read']    ?? 0);
$fallidos   = intval($resumen['st_failed']  ?? 0);

$tasaEntrega = $enviados > 0 ? round(($entregados + $leidos) / $enviados * 100, 1) : 0;
$tasaLectura  = $enviados > 0 ? round($leidos / $enviados * 100, 1) : 0;

// ============================================
// 2. MENSAJES POR DÍA (últimos 30 días)
// ============================================
$sqlPorDia = "SELECT
    DATE(message_date) AS dia,
    SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) AS enviados,
    SUM(CASE WHEN direction='inbound'  THEN 1 ELSE 0 END) AS recibidos
FROM fm_crm_whatsapp_messages
WHERE DATE(message_date) BETWEEN '{$desde_safe}' AND '{$hasta_safe}'
GROUP BY DATE(message_date)
ORDER BY dia ASC";

$rDia = $objSql->consulta($sqlPorDia, "NO HISTORIAL");
$porDia = [];
if ($rDia) {
    while ($row = $rDia->fetch_assoc()) {
        $porDia[] = [
            'dia'      => $row['dia'],
            'enviados' => intval($row['enviados']),
            'recibidos'=> intval($row['recibidos'])
        ];
    }
}

// ============================================
// 3. ÚLTIMOS 50 MENSAJES OUTBOUND CON DETALLE
// ============================================
$sqlMensajes = "SELECT
    m.id, m.phone_number, m.text_body, m.status,
    m.message_date, m.sent_by,
    COALESCE(c.custom_name, c.wa_name, m.phone_number) AS contacto
FROM fm_crm_whatsapp_messages m
LEFT JOIN fm_crm_whatsapp_contacts c ON c.phone_number = m.phone_number
WHERE m.direction = 'outbound'
AND DATE(m.message_date) BETWEEN '{$desde_safe}' AND '{$hasta_safe}'
ORDER BY m.message_date DESC
LIMIT 100";

$rMsgs = $objSql->consulta($sqlMensajes, "NO HISTORIAL");
$mensajes = [];
if ($rMsgs) {
    while ($row = $rMsgs->fetch_assoc()) {
        $mensajes[] = [
            'id'         => intval($row['id']),
            'phone'      => $row['phone_number'],
            'contacto'   => $row['contacto'],
            'texto'      => mb_substr($row['text_body'] ?? '', 0, 80),
            'status'     => $row['status'],
            'fecha'      => $row['message_date'],
            'sent_by'    => $row['sent_by']
        ];
    }
}

// ============================================
// 4. TOP CONTACTOS CON MÁS MENSAJES
// ============================================
$sqlTop = "SELECT
    m.phone_number,
    COALESCE(c.custom_name, c.wa_name, m.phone_number) AS nombre,
    COUNT(*) AS total,
    SUM(CASE WHEN m.status='read' THEN 1 ELSE 0 END) AS leidos
FROM fm_crm_whatsapp_messages m
LEFT JOIN fm_crm_whatsapp_contacts c ON c.phone_number = m.phone_number
WHERE m.direction='outbound'
AND DATE(m.message_date) BETWEEN '{$desde_safe}' AND '{$hasta_safe}'
GROUP BY m.phone_number
ORDER BY total DESC
LIMIT 10";

$rTop = $objSql->consulta($sqlTop, "NO HISTORIAL");
$topContactos = [];
if ($rTop) {
    while ($row = $rTop->fetch_assoc()) {
        $topContactos[] = [
            'phone'  => $row['phone_number'],
            'nombre' => $row['nombre'],
            'total'  => intval($row['total']),
            'leidos' => intval($row['leidos'])
        ];
    }
}

echo json_encode([
    'resumen' => [
        'total'          => intval($resumen['total']   ?? 0),
        'enviados'       => $enviados,
        'recibidos'      => intval($resumen['recibidos'] ?? 0),
        'entregados'     => $entregados,
        'leidos'         => $leidos,
        'fallidos'       => $fallidos,
        'pendientes'     => intval($resumen['st_pending'] ?? 0),
        'tasa_entrega'   => $tasaEntrega,
        'tasa_lectura'   => $tasaLectura
    ],
    'por_dia'       => $porDia,
    'mensajes'      => $mensajes,
    'top_contactos' => $topContactos,
    'filtro'        => ['desde' => $desde, 'hasta' => $hasta]
], JSON_UNESCAPED_UNICODE);
?>
