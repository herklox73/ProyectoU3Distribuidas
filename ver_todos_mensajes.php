<?php
session_start();


$objSql = new cSql;
?>
<!DOCTYPE html>
<html>
<head>
    <title>Ver TODOS los Mensajes</title>
    <style>
        body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
        h1 { color: #4ec9b0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #252526; }
        th { background: #007bff; color: white; padding: 10px; text-align: left; position: sticky; top: 0; }
        td { padding: 8px; border-bottom: 1px solid #3c3c3c; }
        .null { color: #f48771; font-weight: bold; }
        .code { background: #f4f4f4; color: #333; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>

<h1>📋 TODOS los Mensajes en la BD (sin filtros)</h1>

<?php
$sql = "SELECT 
    id,
    whatsapp_account_id,
    message_id,
    phone_number,
    direction,
    message_type,
    text_body,
    status,
    message_date,
    created_at
FROM fm_crm_whatsapp_messages
ORDER BY created_at DESC
LIMIT 50";

echo "<p><strong>SQL:</strong></p>";
echo "<pre>$sql</pre>";

$result = $objSql->consulta($sql, "NO HISTORIAL");

if ($result && $result->num_rows > 0) {
    echo "<p style='color: #4ec9b0;'>✅ Total: " . $result->num_rows . " mensajes</p>";
    echo "<table>";
    echo "<tr>";
    echo "<th>ID</th>";
    echo "<th>Account ID</th>";
    echo "<th>Phone Number</th>";
    echo "<th>Direction</th>";
    echo "<th>Type</th>";
    echo "<th>Text Body</th>";
    echo "<th>Status</th>";
    echo "<th>Date</th>";
    echo "</tr>";
    
    while ($row = $result->fetch_assoc()) {
        echo "<tr>";
        echo "<td class='code'>{$row['id']}</td>";
        
        // Destacar si es NULL
        if ($row['whatsapp_account_id'] === null) {
            echo "<td class='null'>NULL ⚠️</td>";
        } else {
            echo "<td class='code'>{$row['whatsapp_account_id']}</td>";
        }
        
        echo "<td class='code'>{$row['phone_number']}</td>";
        echo "<td>" . strtoupper($row['direction']) . "</td>";
        echo "<td>{$row['message_type']}</td>";
        echo "<td>" . htmlspecialchars(substr($row['text_body'], 0, 50)) . "...</td>";
        echo "<td>{$row['status']}</td>";
        echo "<td>{$row['message_date']}</td>";
        echo "</tr>";
    }
    echo "</table>";
} else {
    echo "<p style='color: #f48771;'>❌ No hay mensajes en la tabla</p>";
}
?>

<hr>

<h2>🔧 Solución:</h2>
<p>Si ves mensajes con <span class="null">whatsapp_account_id = NULL</span>, necesitas:</p>
<ol>
    <li>Actualizar esos mensajes para asignarles el account_id correcto</li>
    <li>Verificar que <code>api_internal.php</code> esté insertando el <code>whatsapp_account_id</code></li>
</ol>

</body>
</html>
