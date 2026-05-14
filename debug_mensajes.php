<?php
session_start();


$objSql = new cSql;
$objEncrip = new cEncriptacion();
require_once("../../../clases/cParametros.php");
$objParam = new cParametros();
$digitador = $objEncrip->decrypt($_SESSION[$objParam->p_nombres_session]);
$digitador_safe = addslashes($digitador);

?>
<!DOCTYPE html>
<html>
<head>
    <title>Debug Mensajes WhatsApp</title>
    <style>
        body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
        .section { background: #252526; padding: 20px; margin: 20px 0; border-radius: 8px; }
        h2 { color: #4ec9b0; margin-top: 0; }
        h3 { color: #569cd6; }
        pre { background: #1e1e1e; padding: 15px; overflow-x: auto; border-left: 3px solid #4ec9b0; }
        .success { color: #4ec9b0; }
        .error { color: #f48771; }
        .warning { color: #dcdcaa; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th { background: #007bff; color: white; padding: 8px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #3c3c3c; }
        .code { background: #f4f4f4; color: #333; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>

<h1>🔍 Debug de Mensajes WhatsApp</h1>

<div class="section">
    <h2>1️⃣ Usuario Actual</h2>
    <p><strong>Digitador:</strong> <span class="code"><?php echo $digitador; ?></span></p>
</div>

<div class="section">
    <h2>2️⃣ Cuenta de WhatsApp del Usuario</h2>
    <?php
    $sqlAccount = "SELECT id, phone_number_id, display_number, business_name, is_active, created_at 
                   FROM fm_crm_whatsapp_accounts 
                   WHERE connected_by = '{$digitador_safe}'
                   ORDER BY is_active DESC, created_at DESC";
    
    echo "<h3>SQL Query:</h3>";
    echo "<pre>$sqlAccount</pre>";
    
    $resultAccount = $objSql->consulta($sqlAccount, "NO HISTORIAL");
    
    if ($resultAccount && $resultAccount->num_rows > 0) {
        echo "<p class='success'>✅ Encontradas " . $resultAccount->num_rows . " cuenta(s)</p>";
        echo "<table>";
        echo "<tr><th>ID</th><th>Phone Number ID</th><th>Display Number</th><th>Business Name</th><th>Active</th><th>Created</th></tr>";
        
        while ($account = $resultAccount->fetch_assoc()) {
            $activeClass = $account['is_active'] ? 'success' : 'error';
            echo "<tr>";
            echo "<td class='code'>{$account['id']}</td>";
            echo "<td class='code'>{$account['phone_number_id']}</td>";
            echo "<td>{$account['display_number']}</td>";
            echo "<td>{$account['business_name']}</td>";
            echo "<td class='$activeClass'>" . ($account['is_active'] ? 'SÍ' : 'NO') . "</td>";
            echo "<td>{$account['created_at']}</td>";
            echo "</tr>";
        }
        echo "</table>";
        
        // Resetear el puntero para obtener la cuenta activa
        $resultAccount->data_seek(0);
        $accountActiva = null;
        while ($acc = $resultAccount->fetch_assoc()) {
            if ($acc['is_active'] == 1) {
                $accountActiva = $acc;
                break;
            }
        }
        
        if ($accountActiva) {
            $accountId = $accountActiva['id'];
            echo "<p class='success'>✅ Cuenta activa encontrada: ID = {$accountId}</p>";
        } else {
            echo "<p class='error'>❌ No hay cuenta activa</p>";
            exit;
        }
        
    } else {
        echo "<p class='error'>❌ No se encontraron cuentas para este usuario</p>";
        exit;
    }
    ?>
</div>

<div class="section">
    <h2>3️⃣ Mensajes en la BD</h2>
    <?php
    $sqlMessages = "SELECT 
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
    WHERE whatsapp_account_id = {$accountId}
    ORDER BY message_timestamp DESC
    LIMIT 20";
    
    echo "<h3>SQL Query:</h3>";
    echo "<pre>$sqlMessages</pre>";
    
    $resultMessages = $objSql->consulta($sqlMessages, "NO HISTORIAL");
    
    if ($resultMessages && $resultMessages->num_rows > 0) {
        echo "<p class='success'>✅ Encontrados " . $resultMessages->num_rows . " mensajes</p>";
        echo "<table>";
        echo "<tr><th>ID</th><th>Account ID</th><th>Phone Number</th><th>Direction</th><th>Type</th><th>Text</th><th>Status</th><th>Date</th></tr>";
        
        while ($msg = $resultMessages->fetch_assoc()) {
            $dirClass = $msg['direction'] === 'inbound' ? 'success' : 'warning';
            echo "<tr>";
            echo "<td class='code'>{$msg['id']}</td>";
            echo "<td class='code'>{$msg['whatsapp_account_id']}</td>";
            echo "<td class='code'>{$msg['phone_number']}</td>";
            echo "<td class='$dirClass'>" . strtoupper($msg['direction']) . "</td>";
            echo "<td>{$msg['message_type']}</td>";
            echo "<td>" . htmlspecialchars(substr($msg['text_body'], 0, 50)) . "</td>";
            echo "<td>{$msg['status']}</td>";
            echo "<td>{$msg['message_date']}</td>";
            echo "</tr>";
        }
        echo "</table>";
    } else {
        echo "<p class='error'>❌ No se encontraron mensajes para whatsapp_account_id = {$accountId}</p>";
    }
    ?>
</div>

<div class="section">
    <h2>4️⃣ Conversaciones Agrupadas</h2>
    <?php
    $sqlConv = "SELECT 
        phone_number,
        COUNT(*) as total_mensajes,
        MAX(message_timestamp) as ultimo_timestamp,
        MAX(created_at) as ultima_fecha
    FROM fm_crm_whatsapp_messages
    WHERE whatsapp_account_id = {$accountId}
    GROUP BY phone_number
    ORDER BY ultimo_timestamp DESC";
    
    echo "<h3>SQL Query:</h3>";
    echo "<pre>$sqlConv</pre>";
    
    $resultConv = $objSql->consulta($sqlConv, "NO HISTORIAL");
    
    if ($resultConv && $resultConv->num_rows > 0) {
        echo "<p class='success'>✅ Encontradas " . $resultConv->num_rows . " conversación(es)</p>";
        echo "<table>";
        echo "<tr><th>Phone Number</th><th>Total Mensajes</th><th>Último Timestamp</th><th>Última Fecha</th></tr>";
        
        while ($conv = $resultConv->fetch_assoc()) {
            echo "<tr>";
            echo "<td class='code'>{$conv['phone_number']}</td>";
            echo "<td>{$conv['total_mensajes']}</td>";
            echo "<td class='code'>{$conv['ultimo_timestamp']}</td>";
            echo "<td>{$conv['ultima_fecha']}</td>";
            echo "</tr>";
        }
        echo "</table>";
    } else {
        echo "<p class='error'>❌ No se encontraron conversaciones</p>";
    }
    ?>
</div>

<div class="section">
    <h2>5️⃣ Respuesta de leer_mensajes.php</h2>
    <?php
    $url = 'leer_mensajes.php?t=' . time();
    echo "<p><strong>URL:</strong> <span class='code'>$url</span></p>";
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_COOKIE, session_name() . '=' . session_id());
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    echo "<p><strong>HTTP Code:</strong> <span class='code'>$httpCode</span></p>";
    
    if ($httpCode == 200) {
        echo "<h3>Respuesta JSON:</h3>";
        $decoded = json_decode($response, true);
        
        if ($decoded) {
            echo "<pre>" . json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "</pre>";
            
            if (isset($decoded['mensajes']) && is_array($decoded['mensajes'])) {
                $count = count($decoded['mensajes']);
                if ($count > 0) {
                    echo "<p class='success'>✅ {$count} conversación(es) en la respuesta</p>";
                } else {
                    echo "<p class='error'>❌ Array de mensajes está vacío</p>";
                }
            }
        } else {
            echo "<p class='error'>❌ Error al decodificar JSON</p>";
            echo "<pre>" . htmlspecialchars($response) . "</pre>";
        }
    } else {
        echo "<p class='error'>❌ Error HTTP: $httpCode</p>";
        echo "<pre>" . htmlspecialchars($response) . "</pre>";
    }
    ?>
</div>

<div class="section">
    <h2>6️⃣ Consola del Navegador (JavaScript)</h2>
    <p>Abre la consola del navegador (F12) y ejecuta:</p>
    <pre>fetch('leer_mensajes.php?t=' + Date.now())
    .then(r => r.json())
    .then(data => console.log('Datos:', data))
    .catch(err => console.error('Error:', err));</pre>
</div>

<div class="section">
    <a href="index.php" style="color: #4ec9b0;">← Volver a la aplicación</a>
</div>

</body>
</html>
