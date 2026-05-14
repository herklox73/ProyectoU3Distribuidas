<?php
// ⚠️ ARCHIVO TEMPORAL PARA DEBUGGING - ELIMINAR EN PRODUCCIÓN
session_start();

$objSql = new cSql;

// ============================================
// PROCESAR ACCIONES (DELETE)
// ============================================
if (isset($_POST['action'])) {
    if ($_POST['action'] === 'delete_message' && isset($_POST['message_id'])) {
        $messageId = intval($_POST['message_id']);
        $sqlDelete = "DELETE FROM fm_crm_whatsapp_messages WHERE id = {$messageId}";
        $objSql->consulta($sqlDelete, "NO HISTORIAL");
        $successMsg = "✅ Mensaje ID {$messageId} eliminado correctamente";
    }
    
    if ($_POST['action'] === 'delete_all_messages') {
        $sqlDelete = "DELETE FROM fm_crm_whatsapp_messages";
        $objSql->consulta($sqlDelete, "NO HISTORIAL");
        $successMsg = "✅ Todos los mensajes eliminados correctamente";
    }
    
    if ($_POST['action'] === 'delete_conversation' && isset($_POST['phone_number'])) {
        $phoneNumber = addslashes($_POST['phone_number']);
        $sqlDelete = "DELETE FROM fm_crm_whatsapp_messages WHERE phone_number = '{$phoneNumber}'";
        $objSql->consulta($sqlDelete, "NO HISTORIAL");
        $successMsg = "✅ Conversación con {$phoneNumber} eliminada";
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Debug - Base de Datos WhatsApp</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; padding: 20px; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px; }
        .success { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin-bottom: 20px; color: #155724; }
        .container { max-width: 1600px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 20px; }
        h2 { color: #007bff; margin-bottom: 15px; font-size: 18px; }
        .section { background: white; margin: 20px 0; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th { background: #007bff; color: white; padding: 10px 8px; text-align: left; font-size: 11px; position: sticky; top: 0; }
        td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 11px; }
        tr:hover { background: #f8f9fa; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 10px; font-weight: bold; }
        .badge-success { background: #28a745; color: white; }
        .badge-danger { background: #dc3545; color: white; }
        .badge-warning { background: #ffc107; color: black; }
        .badge-info { background: #17a2b8; color: white; }
        .badge-secondary { background: #6c757d; color: white; }
        .code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 10px; }
        .token { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .btn { display: inline-block; padding: 8px 16px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px 5px 5px 0; border: none; cursor: pointer; font-size: 13px; }
        .btn:hover { background: #0056b3; }
        .btn-danger { background: #dc3545; }
        .btn-danger:hover { background: #c82333; }
        .btn-sm { padding: 4px 8px; font-size: 11px; }
        .empty { text-align: center; padding: 40px; color: #999; }
        pre { background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 11px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; color: white; }
        .stat-card h3 { font-size: 14px; margin-bottom: 5px; opacity: 0.9; }
        .stat-card .number { font-size: 32px; font-weight: bold; }
        .message-content { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .filters { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 15px; }
        .filters select, .filters input { padding: 8px; margin: 5px; border: 1px solid #ddd; border-radius: 4px; }
        .table-scroll { max-height: 600px; overflow-y: auto; }
    </style>
</head>
<body>
    <div class="container">
        <div class="warning">
            <strong>⚠️ ARCHIVO TEMPORAL DE DEBUG</strong> - Este archivo muestra información sensible. Eliminarlo después de debugging.
        </div>

        <?php if (isset($successMsg)): ?>
        <div class="success">
            <?php echo $successMsg; ?>
        </div>
        <?php endif; ?>

        <h1>🗄️ Debug - Base de Datos WhatsApp</h1>
        <p>Última actualización: <?php echo date('Y-m-d H:i:s'); ?></p>
        <a href="javascript:location.reload()" class="btn">🔄 Actualizar</a>

        <!-- ESTADÍSTICAS -->
        <div class="section">
            <h2>📊 Estadísticas</h2>
            <div class="stats">
                <?php
                // Total cuentas
                $sqlCount = "SELECT COUNT(*) as total FROM fm_crm_whatsapp_accounts WHERE is_active = 1";
                $resultCount = $objSql->consulta($sqlCount, "NO HISTORIAL");
                $totalAccounts = $resultCount->fetch_assoc()['total'];
                
                // Total mensajes
                $sqlCount = "SELECT COUNT(*) as total FROM fm_crm_whatsapp_messages";
                $resultCount = $objSql->consulta($sqlCount, "NO HISTORIAL");
                $totalMessages = $resultCount->fetch_assoc()['total'];
                
                // Total conversaciones únicas
                $sqlCount = "SELECT COUNT(DISTINCT phone_number) as total FROM fm_crm_whatsapp_messages";
                $resultCount = $objSql->consulta($sqlCount, "NO HISTORIAL");
                $totalConversations = $resultCount->fetch_assoc()['total'];
                
                // Mensajes hoy
                $sqlCount = "SELECT COUNT(*) as total FROM fm_crm_whatsapp_messages WHERE DATE(message_date) = CURDATE()";
                $resultCount = $objSql->consulta($sqlCount, "NO HISTORIAL");
                $messagesToday = $resultCount->fetch_assoc()['total'];
                ?>
                
                <div class="stat-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                    <h3>📱 Cuentas Activas</h3>
                    <div class="number"><?php echo $totalAccounts; ?></div>
                </div>
                
                <div class="stat-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                    <h3>💬 Total Mensajes</h3>
                    <div class="number"><?php echo $totalMessages; ?></div>
                </div>
                
                <div class="stat-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                    <h3>👥 Conversaciones</h3>
                    <div class="number"><?php echo $totalConversations; ?></div>
                </div>
                
                <div class="stat-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
                    <h3>📅 Mensajes Hoy</h3>
                    <div class="number"><?php echo $messagesToday; ?></div>
                </div>
            </div>
        </div>

        <!-- CUENTAS DE WHATSAPP -->
        <div class="section">
            <h2>📱 Cuentas de WhatsApp (fm_crm_whatsapp_accounts)</h2>
            <?php
            $sql = "SELECT * FROM fm_crm_whatsapp_accounts ORDER BY updated_at DESC";
            $result = $objSql->consulta($sql, "NO HISTORIAL");
            
            if ($result && $result->num_rows > 0):
            ?>
                <p><strong>Total de registros:</strong> <?php echo $result->num_rows; ?></p>
                <div class="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Phone Number ID</th>
                            <th>Display Number</th>
                            <th>Business Name</th>
                            <th>Connected By</th>
                            <th>WABA ID</th>
                            <th>Access Token</th>
                            <th>Estado</th>
                            <th>Creado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php while ($row = $result->fetch_assoc()): ?>
                        <tr>
                            <td><?php echo $row['id']; ?></td>
                            <td><span class="code"><?php echo $row['phone_number_id']; ?></span></td>
                            <td><strong><?php echo $row['display_number']; ?></strong></td>
                            <td><?php echo $row['business_name'] ?? '<em>N/A</em>'; ?></td>
                            <td><span class="code"><?php echo $row['connected_by'] ?? '<em>N/A</em>'; ?></span></td>
                            <td><span class="code"><?php echo substr($row['waba_id'], 0, 15); ?>...</span></td>
                            <td class="token" title="<?php echo $row['access_token']; ?>">
                                <span class="code"><?php echo substr($row['access_token'], 0, 20); ?>...</span>
                            </td>
                            <td>
                                <?php if ($row['is_active']): ?>
                                    <span class="badge badge-success">✓ ACTIVO</span>
                                <?php else: ?>
                                    <span class="badge badge-danger">✗ INACTIVO</span>
                                <?php endif; ?>
                            </td>
                            <td><?php echo $row['created_at']; ?></td>
                        </tr>
                        <?php endwhile; ?>
                    </tbody>
                </table>
                </div>
            <?php else: ?>
                <div class="empty">📭 No hay cuentas de WhatsApp registradas</div>
            <?php endif; ?>
        </div>

        <!-- CONVERSACIONES -->
        <div class="section">
            <h2>💬 Conversaciones Activas</h2>
            <?php
            $sql = "SELECT 
                        phone_number,
                        MAX(message_timestamp) as last_message_timestamp,
                        MAX(message_date) as last_message_date,
                        COUNT(*) as message_count,
                        SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as received_count,
                        SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as sent_count
                    FROM fm_crm_whatsapp_messages
                    GROUP BY phone_number
                    ORDER BY last_message_timestamp DESC
                    LIMIT 50";
            $result = $objSql->consulta($sql, "NO HISTORIAL");
            
            if ($result && $result->num_rows > 0):
            ?>
                <p><strong>Últimas 50 conversaciones</strong></p>
                <div class="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Teléfono</th>
                            <th>Total Msgs</th>
                            <th>Recibidos</th>
                            <th>Enviados</th>
                            <th>Último Mensaje</th>
                            <th>Ventana 24h</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php while ($row = $result->fetch_assoc()): 
                            $ventanaExpira = $row['last_message_timestamp'] + (24 * 3600);
                            $dentroDe24h = (time() < $ventanaExpira);
                        ?>
                        <tr>
                            <td><strong>+<?php echo $row['phone_number']; ?></strong></td>
                            <td><span class="badge badge-info"><?php echo $row['message_count']; ?></span></td>
                            <td><span class="badge badge-success"><?php echo $row['received_count']; ?></span></td>
                            <td><span class="badge badge-warning"><?php echo $row['sent_count']; ?></span></td>
                            <td><?php echo $row['last_message_date']; ?></td>
                            <td>
                                <?php if ($dentroDe24h): ?>
                                    <span class="badge badge-success">✓ ABIERTA</span>
                                    <br><small><?php echo date('Y-m-d H:i', $ventanaExpira); ?></small>
                                <?php else: ?>
                                    <span class="badge badge-danger">✗ CERRADA</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <form method="POST" style="display: inline;" onsubmit="return confirm('¿Eliminar toda esta conversación?');">
                                    <input type="hidden" name="action" value="delete_conversation">
                                    <input type="hidden" name="phone_number" value="<?php echo $row['phone_number']; ?>">
                                    <button type="submit" class="btn btn-sm btn-danger">🗑️ Eliminar</button>
                                </form>
                            </td>
                        </tr>
                        <?php endwhile; ?>
                    </tbody>
                </table>
                </div>
            <?php else: ?>
                <div class="empty">📭 No hay conversaciones registradas</div>
            <?php endif; ?>
        </div>

        <!-- MENSAJES RECIENTES -->
        <div class="section">
            <h2>💌 Mensajes (fm_crm_whatsapp_messages)</h2>
            
            <!-- Filtros -->
            <div class="filters">
                <form method="GET" style="display: inline-flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <label>
                        <strong>Dirección:</strong>
                        <select name="filter_direction">
                            <option value="">Todos</option>
                            <option value="inbound" <?php echo ($_GET['filter_direction'] ?? '') === 'inbound' ? 'selected' : ''; ?>>Recibidos</option>
                            <option value="outbound" <?php echo ($_GET['filter_direction'] ?? '') === 'outbound' ? 'selected' : ''; ?>>Enviados</option>
                        </select>
                    </label>
                    
                    <label>
                        <strong>Tipo:</strong>
                        <select name="filter_type">
                            <option value="">Todos</option>
                            <option value="text" <?php echo ($_GET['filter_type'] ?? '') === 'text' ? 'selected' : ''; ?>>Texto</option>
                            <option value="image" <?php echo ($_GET['filter_type'] ?? '') === 'image' ? 'selected' : ''; ?>>Imagen</option>
                            <option value="video" <?php echo ($_GET['filter_type'] ?? '') === 'video' ? 'selected' : ''; ?>>Video</option>
                            <option value="audio" <?php echo ($_GET['filter_type'] ?? '') === 'audio' ? 'selected' : ''; ?>>Audio</option>
                            <option value="document" <?php echo ($_GET['filter_type'] ?? '') === 'document' ? 'selected' : ''; ?>>Documento</option>
                        </select>
                    </label>
                    
                    <label>
                        <strong>Teléfono:</strong>
                        <input type="text" name="filter_phone" value="<?php echo htmlspecialchars($_GET['filter_phone'] ?? ''); ?>" placeholder="593983841044">
                    </label>
                    
                    <button type="submit" class="btn btn-sm">🔍 Filtrar</button>
                    <a href="?" class="btn btn-sm">✖️ Limpiar</a>
                </form>
            </div>
            
            <!-- Acciones masivas -->
            <div style="margin-bottom: 15px;">
                <form method="POST" style="display: inline;" onsubmit="return confirm('⚠️ ¿ELIMINAR TODOS LOS MENSAJES? Esta acción no se puede deshacer.');">
                    <input type="hidden" name="action" value="delete_all_messages">
                    <button type="submit" class="btn btn-danger">🗑️ Eliminar TODOS los mensajes</button>
                </form>
            </div>
            
            <?php
            // Construir query con filtros
            $where = [];
            if (!empty($_GET['filter_direction'])) {
                $where[] = "direction = '" . addslashes($_GET['filter_direction']) . "'";
            }
            if (!empty($_GET['filter_type'])) {
                $where[] = "message_type = '" . addslashes($_GET['filter_type']) . "'";
            }
            if (!empty($_GET['filter_phone'])) {
                $phone = preg_replace('/[^0-9]/', '', $_GET['filter_phone']);
                $where[] = "phone_number LIKE '%" . addslashes($phone) . "%'";
            }
            
            $whereClause = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";
            
            $sql = "SELECT * FROM fm_crm_whatsapp_messages 
                    {$whereClause}
                    ORDER BY message_timestamp DESC, id DESC 
                    LIMIT 200";
            $result = $objSql->consulta($sql, "NO HISTORIAL");
            
            if ($result && $result->num_rows > 0):
            ?>
                <p><strong>Mostrando:</strong> <?php echo $result->num_rows; ?> mensajes</p>
                <div class="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Teléfono</th>
                            <th>Dirección</th>
                            <th>Tipo</th>
                            <th>Contenido</th>
                            <th>Media</th>
                            <th>Estado</th>
                            <th>Enviado Por</th>
                            <th>Fecha</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php while ($row = $result->fetch_assoc()): ?>
                        <tr>
                            <td><span class="code"><?php echo $row['id']; ?></span></td>
                            <td><strong>+<?php echo $row['phone_number']; ?></strong></td>
                            <td>
                                <?php if ($row['direction'] === 'inbound'): ?>
                                    <span class="badge badge-success">← IN</span>
                                <?php else: ?>
                                    <span class="badge badge-warning">OUT →</span>
                                <?php endif; ?>
                            </td>
                            <td><span class="code"><?php echo $row['message_type']; ?></span></td>
                            <td class="message-content" title="<?php echo htmlspecialchars($row['text_body'] ?? ''); ?>">
                                <?php 
                                if ($row['text_body']) {
                                    echo htmlspecialchars(substr($row['text_body'], 0, 100));
                                } else {
                                    echo '<em>[' . strtoupper($row['message_type']) . ']</em>';
                                }
                                ?>
                            </td>
                            <td>
                                <?php if ($row['media_url']): ?>
                                    <a href="<?php echo $row['media_url']; ?>" target="_blank" class="badge badge-info">📎 Ver</a>
                                    <?php if ($row['media_filename']): ?>
                                        <br><small><?php echo $row['media_filename']; ?></small>
                                    <?php endif; ?>
                                <?php else: ?>
                                    -
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php 
                                $statusColors = [
                                    'pending' => 'secondary',
                                    'sent' => 'info',
                                    'delivered' => 'success',
                                    'read' => 'success',
                                    'failed' => 'danger'
                                ];
                                $color = $statusColors[$row['status']] ?? 'secondary';
                                ?>
                                <span class="badge badge-<?php echo $color; ?>"><?php echo strtoupper($row['status']); ?></span>
                            </td>
                            <td><small><?php echo $row['sent_by'] ?? '-'; ?></small></td>
                            <td>
                                <?php echo $row['message_date']; ?><br>
                                <small class="code"><?php echo $row['message_id'] ? substr($row['message_id'], 0, 15) . '...' : 'N/A'; ?></small>
                            </td>
                            <td>
                                <form method="POST" style="display: inline;" onsubmit="return confirm('¿Eliminar este mensaje?');">
                                    <input type="hidden" name="action" value="delete_message">
                                    <input type="hidden" name="message_id" value="<?php echo $row['id']; ?>">
                                    <button type="submit" class="btn btn-sm btn-danger">🗑️</button>
                                </form>
                            </td>
                        </tr>
                        <?php endwhile; ?>
                    </tbody>
                </table>
                </div>
            <?php else: ?>
                <div class="empty">📭 No hay mensajes que coincidan con los filtros</div>
            <?php endif; ?>
        </div>

        <!-- QUERY PERSONALIZADO -->
        <div class="section">
            <h2>🔍 Ejecutar Query Personalizado</h2>
            <form method="POST" style="margin-top: 15px;">
                <textarea name="custom_query" rows="5" style="width: 100%; padding: 10px; font-family: monospace; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;" placeholder="SELECT * FROM fm_crm_whatsapp_messages WHERE phone_number = '593983841044'"><?php echo htmlspecialchars($_POST['custom_query'] ?? ''); ?></textarea>
                <br><br>
                <button type="submit" class="btn">▶️ Ejecutar Query</button>
                <small style="color: #999; display: block; margin-top: 10px;">⚠️ Solo SELECT queries. No ejecutar UPDATE/DELETE/INSERT desde aquí.</small>
            </form>

            <?php
            if (isset($_POST['custom_query'])) {
                $query = trim($_POST['custom_query']);
                
                // Validar que solo sea SELECT
                if (stripos($query, 'SELECT') === 0) {
                    echo "<h3 style='margin-top: 20px;'>Resultados:</h3>";
                    
                    try {
                        $result = $objSql->consulta($query, "NO HISTORIAL");
                        
                        if ($result && $result->num_rows > 0) {
                            echo "<p><strong>Registros encontrados:</strong> " . $result->num_rows . "</p>";
                            echo "<div style='overflow-x: auto;'><table><thead><tr>";
                            
                            // Headers
                            $first_row = $result->fetch_assoc();
                            foreach (array_keys($first_row) as $col) {
                                echo "<th>" . htmlspecialchars($col) . "</th>";
                            }
                            echo "</tr></thead><tbody>";
                            
                            // Primera fila
                            echo "<tr>";
                            foreach ($first_row as $val) {
                                echo "<td>" . htmlspecialchars($val ?? 'NULL') . "</td>";
                            }
                            echo "</tr>";
                            
                            // Resto de filas
                            while ($row = $result->fetch_assoc()) {
                                echo "<tr>";
                                foreach ($row as $val) {
                                    echo "<td>" . htmlspecialchars($val ?? 'NULL') . "</td>";
                                }
                                echo "</tr>";
                            }
                            
                            echo "</tbody></table></div>";
                        } else {
                            echo "<div class='empty'>No se encontraron resultados</div>";
                        }
                    } catch (Exception $e) {
                        echo "<div style='background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px;'>";
                        echo "<strong>Error:</strong> " . htmlspecialchars($e->getMessage());
                        echo "</div>";
                    }
                } else {
                    echo "<div style='background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin-top: 15px;'>";
                    echo "<strong>⚠️ Solo se permiten queries SELECT</strong>";
                    echo "</div>";
                }
            }
            ?>
        </div>
    </div>
</body>
</html>
