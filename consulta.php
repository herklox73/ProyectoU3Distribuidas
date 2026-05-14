<?php
require_once 'config.php';
// Consultar proveedores (cuentas)
$sqlProviders = "SELECT * FROM api_providers ORDER BY created_at DESC";
$resultProviders = $objSql->consulta($sqlProviders, "NO HISTORIAL");
$providers = [];
if ($resultProviders && $resultProviders->num_rows > 0) {
    while ($row = $resultProviders->fetch_assoc()) {
        $providers[] = $row;
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔍 Diagnóstico WhatsApp - Mapeo Empresa</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace; 
            background: #1e1e1e; 
            color: #d4d4d4; 
            padding: 20px;
            font-size: 13px;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            color: white;
        }
        .header h1 { font-size: 22px; margin-bottom: 8px; }
        .header .info { opacity: 0.9; font-size: 13px; line-height: 1.8; }

        .section {
            background: #252526;
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            margin-bottom: 20px;
            overflow: hidden;
        }
        .section-header {
            background: #2d2d30;
            padding: 12px 15px;
            border-bottom: 1px solid #3c3c3c;
            font-size: 15px;
            font-weight: bold;
        }
        .section-body { padding: 15px; overflow-x: auto; }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        th {
            background: #2d2d30;
            padding: 8px 10px;
            text-align: left;
            color: #569cd6;
            border-bottom: 2px solid #3c3c3c;
            white-space: nowrap;
        }
        td {
            padding: 8px 10px;
            border-bottom: 1px solid #3c3c3c;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        tr:hover { background: #2a2d2e; }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: bold;
        }
        .badge-ok { background: #1b5e20; color: #4ec9b0; }
        .badge-error { background: #b71c1c; color: #f48771; }
        .badge-warn { background: #4a3800; color: #dcdcaa; }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: #2d2d30;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #0e639c;
            text-align: center;
        }
        .stat-card.ok { border-left-color: #4ec9b0; }
        .stat-card.error { border-left-color: #f48771; }
        .stat-card.warn { border-left-color: #dcdcaa; }
        .stat-label { font-size: 11px; color: #858585; margin-bottom: 5px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #4ec9b0; }
        .stat-value.error { color: #f48771; }

        .token-cell { 
            max-width: 120px; 
            cursor: pointer; 
            color: #858585;
        }
        .token-cell:hover { color: #d4d4d4; }

        .empty-msg {
            text-align: center;
            padding: 30px;
            color: #858585;
            font-style: italic;
        }
    </style>
</head>
<body>

<!-- HEADER -->
<div class="header">
    <h1>🔍 Diagnóstico WhatsApp - Mapeo Empresa</h1>
    <div class="info">
        🕐 <?php echo date('Y-m-d H:i:s'); ?>
    </div>
</div>

<!-- ESTADÍSTICAS -->
<?php
$activos = 0;
foreach ($providers as $p) { if ($p['is_active'] == 1) $activos++; }
?>
<div class="stats">
    <div class="stat-card ok">
        <div class="stat-label">PROVEEDORES CONFIGURADOS</div>
        <div class="stat-value"><?php echo count($providers); ?></div>
    </div>
    <div class="stat-card ok">
        <div class="stat-label">PROVEEDORES ACTIVOS</div>
        <div class="stat-value"><?php echo $activos; ?></div>
    </div>
</div>

<!-- SECCIÓN 1: PROVEEDORES -->
<div class="section">
    <div class="section-header" style="color: #4ec9b0;">
        🗄️ BASE DATOS → api_providers
    </div>
    <div class="section-body">
        <?php if (count($providers) > 0): ?>
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>phone_number_id</th>
                    <th>waba_id</th>
                    <th>display_number</th>
                    <th>business_name</th>
                    <th>is_active</th>
                    <th>access_token</th>
                    <th>created_at</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($providers as $prov): ?>
                <tr>
                    <td><?php echo $prov['id']; ?></td>
                    <td><strong><?php echo htmlspecialchars($prov['phone_number_id']); ?></strong></td>
                    <td><?php echo htmlspecialchars($prov['waba_id'] ?? '-'); ?></td>
                    <td><?php echo htmlspecialchars($prov['display_number'] ?? '-'); ?></td>
                    <td><?php echo htmlspecialchars($prov['business_name'] ?? '-'); ?></td>
                    <td>
                        <?php if ($prov['is_active'] == 1): ?>
                            <span class="badge badge-ok">ACTIVA</span>
                        <?php else: ?>
                            <span class="badge badge-error">INACTIVA</span>
                        <?php endif; ?>
                    </td>
                    <td class="token-cell" title="<?php echo htmlspecialchars($prov['access_token'] ?? ''); ?>">
                        <?php echo $prov['access_token'] ? substr($prov['access_token'], 0, 20) . '...' : '-'; ?>
                    </td>
                    <td><?php echo htmlspecialchars($prov['created_at'] ?? '-'); ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php else: ?>
            <div class="empty-msg">📭 No hay cuentas registradas</div>
        <?php endif; ?>
    </div>
</div>

<div style="text-align: center; color: #858585; margin-top: 20px; padding: 20px;">
    <a href="?" style="color: #569cd6; text-decoration: none;">🔄 Recargar</a>
</div>

</body>
</html>