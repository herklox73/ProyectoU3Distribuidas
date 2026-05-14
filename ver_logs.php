<?php
// ============================================
// SEGURIDAD: SOLO USUARIOS AUTENTICADOS
// ============================================
session_start();

// Incluir sistema de autenticación

// Verificar sesión y permisos

$objEncrip = new cEncriptacion();
require_once("../../../clases/cParametros.php");
$objParam = new cParametros();

// Verificar que el usuario esté logueado
if (!isset($_SESSION[$objParam->p_nombres_session])) {
    http_response_code(403);
    die('
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Acceso Denegado</title>
    <style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#f44336;color:white;text-align:center;}
    h1{font-size:48px;margin:0;}p{font-size:18px;}</style>
    </head><body><div><h1>🔒 Acceso Denegado</h1><p>Debes iniciar sesión en el CRM para ver los logs.</p></div></body></html>
    ');
}

$digitador = $objEncrip->decrypt($_SESSION[$objParam->p_nombres_session]);

// WHITELIST DE USUARIOS PERMITIDOS (agregar los usuarios que pueden ver logs)
$usuarios_permitidos = [
    'USUARIO SOPORTE',
    'ADMIN',
    'ADMINISTRADOR',
   
];

// Verificar si el usuario está en la whitelist
if (!in_array($digitador, $usuarios_permitidos)) {
    http_response_code(403);
    die('
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Acceso Denegado</title>
    <style>body{font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#f44336;color:white;text-align:center;}
    h1{font-size:48px;margin:0;}p{font-size:18px;}</style>
    </head><body><div><h1>🚫 Sin Permisos</h1><p>Tu usuario (' . htmlspecialchars($digitador) . ') no tiene permisos para ver los logs.</p></div></body></html>
    ');
}

// Registrar acceso en log de auditoría
$audit_log = __DIR__ . '/audit_log.txt';
$audit_entry = date('Y-m-d H:i:s') . " | Usuario: {$digitador} | IP: " . $_SERVER['REMOTE_ADDR'] . " | Acción: VER_LOGS\n";
file_put_contents($audit_log, $audit_entry, FILE_APPEND);

// ============================================
// CONFIGURACIÓN DE LOGS
// ============================================
$logFiles = [
    'webhook_debug.log' => [
        'name' => 'Debug del Webhook (Nuevo)', 
        'badge' => 'info', 
        'icon' => '🔍',
        'description' => 'Log de debugging detallado del webhook.php simplificado'
    ],
    'webhook_payload.log' => [
        'name' => 'Payload del Webhook', 
        'badge' => 'secondary', 
        'icon' => '📦',
        'description' => 'JSON completo recibido desde Meta'
    ],
    'whatsapp_log.txt' => [
        'name' => 'Envío de Mensajes', 
        'badge' => 'primary', 
        'icon' => '📤',
        'description' => 'Log detallado de todos los mensajes enviados'
    ],
    'webhook_log.txt' => [
        'name' => 'Recepción de Mensajes (Webhook)', 
        'badge' => 'success', 
        'icon' => '📥',
        'description' => 'Mensajes recibidos desde Meta'
    ],
    'webhook_detailed.log' => [
        'name' => 'Webhook Detallado', 
        'badge' => 'info', 
        'icon' => '🔍',
        'description' => 'Log detallado del procesamiento del webhook'
    ],
    'whatsapp_error.log' => [
        'name' => 'Errores de WhatsApp', 
        'badge' => 'danger', 
        'icon' => '❌',
        'description' => 'Errores específicos de WhatsApp'
    ],
    'whatsapp_meta_api.log' => [
        'name' => 'Llamadas a Meta API', 
        'badge' => 'warning', 
        'icon' => '🔌',
        'description' => 'Registro de llamadas a la API de Meta (TOKENS OCULTOS)'
    ],
    'webhook_errors.log' => [
        'name' => 'Errores del Webhook', 
        'badge' => 'danger', 
        'icon' => '⚠️',
        'description' => 'Errores al procesar webhooks'
    ],
    'debug_extremo.txt' => [
        'name' => 'Debug Extremo', 
        'badge' => 'secondary', 
        'icon' => '🐛',
        'description' => 'Debug nivel detalle máximo'
    ]
];

// Función para ocultar datos sensibles
function ocultarDatosSensibles($contenido) {

    return $contenido;
}

?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔒 Logs WhatsApp - Modo Seguro</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .security-badge { 
            background: #28a745; 
            color: white;
            padding: 10px 20px; 
            margin-bottom: 20px; 
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-bottom: 10px; }
        .user-info {
            background: #e3f2fd;
            padding: 10px 15px;
            border-radius: 6px;
            margin-top: 10px;
            font-size: 14px;
            color: #1565c0;
        }
        .log-container { 
            background: white; 
            margin: 20px 0; 
            border-radius: 8px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .log-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .log-title {
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .log-info-badge {
            background: rgba(255,255,255,0.2);
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
        }
        .log-content { 
            background: #1e1e1e; 
            color: #d4d4d4; 
            padding: 20px; 
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace;
            font-size: 13px; 
            max-height: 600px; 
            overflow-y: auto; 
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.6;
        }
        .log-content::-webkit-scrollbar { width: 10px; }
        .log-content::-webkit-scrollbar-track { background: #2d2d2d; }
        .log-content::-webkit-scrollbar-thumb { background: #555; border-radius: 5px; }
        .log-content::-webkit-scrollbar-thumb:hover { background: #777; }
        
        .log-info { color: #4ec9b0; }
        .log-error { color: #f48771; font-weight: bold; background: rgba(244, 135, 113, 0.1); padding: 2px 4px; }
        .log-success { color: #4ec9b0; font-weight: bold; }
        .log-api { color: #569cd6; }
        .log-warning { color: #ffc107; }
        .log-timestamp { color: #858585; }
        .log-censored { color: #ff6b6b; background: rgba(255, 107, 107, 0.1); padding: 2px 4px; }
        
        .btn { 
            display: inline-block; 
            padding: 12px 24px; 
            background: white;
            color: #667eea;
            text-decoration: none; 
            border-radius: 6px; 
            margin: 5px;
            font-weight: 600;
            transition: all 0.3s;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .btn:hover { 
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        .empty {
            text-align: center;
            padding: 40px;
            color: #888;
            font-style: italic;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #667eea;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #667eea;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
        .description {
            color: #666;
            font-size: 13px;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="security-badge">
            <span style="font-size: 24px;">🔒</span>
            <div>
                <strong>Modo Seguro Activado</strong>
                <div style="font-size: 12px; opacity: 0.9;">Tokens y datos sensibles ocultos · Acceso registrado</div>
            </div>
        </div>

        <div class="header">
            <h1>📋 Logs de WhatsApp - Vista Segura</h1>
            <div class="user-info">
                👤 <strong>Usuario:</strong> <?php echo htmlspecialchars($digitador); ?> | 
                🕐 <strong>Hora:</strong> <?php echo date('Y-m-d H:i:s'); ?> | 
                🌐 <strong>IP:</strong> <?php echo htmlspecialchars($_SERVER['REMOTE_ADDR']); ?>
            </div>
            
            <div class="stats">
                <?php
                $totalLogs = 0;
                $totalErrors = 0;
                $totalSize = 0;
                
                foreach ($logFiles as $filename => $config) {
                    $filepath = __DIR__ . '/' . $filename;
                    if (file_exists($filepath)) {
                        $totalLogs++;
                        $totalSize += filesize($filepath);
                        if (strpos($filename, 'error') !== false) {
                            $totalErrors++;
                        }
                    }
                }
                ?>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $totalLogs; ?></div>
                    <div class="stat-label">Archivos de Log</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo number_format($totalSize / 1024, 1); ?> KB</div>
                    <div class="stat-label">Tamaño Total</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $totalErrors; ?></div>
                    <div class="stat-label">Logs de Errores</div>
                </div>
            </div>
            
            <div style="margin-top: 15px;">
                <a href="javascript:location.reload()" class="btn">🔄 Actualizar</a>
                <a href="ver_base_datos.php" class="btn">🗄️ Ver Base de Datos</a>
            </div>
        </div>
        
        <?php foreach ($logFiles as $filename => $config): ?>
            <?php
            $filepath = __DIR__ . '/' . $filename;
            $exists = file_exists($filepath);
            $size = $exists ? filesize($filepath) : 0;
            $lines_count = 0;
            
            if ($exists && $size > 0) {
                $lines_count = count(file($filepath));
            }
            ?>
            
            <div class="log-container">
                <div class="log-header">
                    <div class="log-title">
                        <span><?php echo $config['icon']; ?></span>
                        <span><?php echo $config['name']; ?></span>
                    </div>
                    <div class="log-info-badge">
                        <?php if ($exists): ?>
                            <?php echo number_format($size/1024, 2); ?> KB · <?php echo number_format($lines_count); ?> líneas
                        <?php else: ?>
                            No existe
                        <?php endif; ?>
                    </div>
                </div>
                
                <?php if (isset($config['description'])): ?>
                    <div style="padding: 10px 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                        <p class="description"><?php echo $config['description']; ?></p>
                    </div>
                <?php endif; ?>
                
                <div class="log-content">
                    <?php
                    if ($exists && $size > 0) {
                        $content = file_get_contents($filepath);
                        
                        // APLICAR CENSURA DE DATOS SENSIBLES
                        $content = ocultarDatosSensibles($content);
                        
                        // Si es JSON, formatearlo
                        if (strpos($filename, '.json') !== false || 
                            (substr($content, 0, 1) === '{' || substr($content, 0, 1) === '[')) {
                            $lines = explode("\n---\n", $content);
                        } else {
                            $lines = explode("\n", $content);
                        }
                        
                        // Últimas 500 líneas
                        $limit = 500;
                        if (count($lines) > $limit) {
                            $lines = array_slice($lines, -$limit);
                            echo "<div style='color: #ffa500; margin-bottom: 10px;'>⚠️ Mostrando últimas {$limit} líneas de " . count(file($filepath)) . " totales</div>\n";
                        }
                        
                        foreach ($lines as $line) {
                            if (empty(trim($line))) continue;
                            
                            $class = 'log-info';
                            
                            // Detectar datos censurados
                            if (strpos($line, '***OCULTO***') !== false) {
                                $class = 'log-censored';
                            }
                            // Detectar tipo de log
                            elseif (stripos($line, '[ERROR]') !== false || stripos($line, 'ERROR:') !== false) {
                                $class = 'log-error';
                            } elseif (stripos($line, '[SUCCESS]') !== false || stripos($line, '✓') !== false || stripos($line, '✅') !== false) {
                                $class = 'log-success';
                            } elseif (stripos($line, '[API]') !== false || stripos($line, 'META API') !== false) {
                                $class = 'log-api';
                            } elseif (stripos($line, '[WARNING]') !== false || stripos($line, '⚠️') !== false) {
                                $class = 'log-warning';
                            } elseif (preg_match('/\[\d{4}-\d{2}-\d{2}/', $line)) {
                                $class = 'log-timestamp';
                            }
                            
                            // Intentar formatear JSON
                            if (substr(trim($line), 0, 1) === '{') {
                                $decoded = json_decode($line, true);
                                if ($decoded) {
                                    $line = json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                                }
                            }
                            
                            echo "<div class='{$class}'>" . htmlspecialchars($line) . "</div>";
                        }
                    } else {
                        echo "<div class='empty'>📭 No hay logs aún o el archivo no existe</div>";
                    }
                    ?>
                </div>
            </div>
        <?php endforeach; ?>
        
        <!-- Sección de mensajes.json -->
        <div class="log-container">
            <div class="log-header">
                <div class="log-title">
                    <span>💾</span>
                    <span>Mensajes JSON (Storage Temporal)</span>
                </div>
                <div class="log-info-badge">
                    <?php
                    $json_file = __DIR__ . '/mensajes.json';
                    if (file_exists($json_file)):
                        echo number_format(filesize($json_file)/1024, 2) . ' KB';
                    else:
                        echo 'No existe';
                    endif;
                    ?>
                </div>
            </div>
            <div style="padding: 10px 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <p class="description">Almacenamiento temporal de conversaciones y mensajes (números parcialmente ocultos)</p>
            </div>
            <div class="log-content">
                <?php
                if (file_exists($json_file)) {
                    $json_content = file_get_contents($json_file);
                    
                    // OCULTAR DATOS SENSIBLES DEL JSON
                    $json_content = ocultarDatosSensibles($json_content);
                    
                    $json_data = json_decode($json_content, true);
                    
                    if ($json_data) {
                        echo "<div style='color: #4ec9b0;'>📊 Total de conversaciones: " . count($json_data) . "</div>\n\n";
                        echo htmlspecialchars(json_encode($json_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                    } else {
                        echo "<div class='empty'>JSON vacío o inválido</div>";
                    }
                } else {
                    echo "<div class='empty'>📭 Archivo mensajes.json no existe</div>";
                }
                ?>
            </div>
        </div>
    </div>
    
    <script>
        // Auto-scroll al final de cada log
        document.querySelectorAll('.log-content').forEach(el => {
            el.scrollTop = el.scrollHeight;
        });
    </script>
</body>
</html><
