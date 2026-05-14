<?php
file_put_contents(__DIR__ . '/test_carga.txt', 'descargar_media.php SE CARGÓ OK' . "\n", FILE_APPEND);

function descargarMediaWhatsApp($mediaId, $mediaType, $mimeType = null, $token = null, $directUrl = null) {
    $logFile = __DIR__ . '/test_funcion.txt';
    file_put_contents($logFile, '=== DESCARGA === ' . date('H:i:s') . " - Tipo: {$mediaType}\n", FILE_APPEND);
    
    if (!$token) return ['success' => false, 'error' => 'Token requerido'];
    
    $token = trim($token);
    $downloadUrl = $directUrl;
    
    // Si no hay URL directa, obtenerla de la API
    if (!$downloadUrl) {
        if (!$mediaId) return ['success' => false, 'error' => 'Media ID requerido'];
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => API_BASE_URL . "{$mediaId}",
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TIMEOUT => 30
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode != 200) return ['success' => false, 'error' => "HTTP {$httpCode}"];
        
        $mediaInfo = json_decode($response, true);
        if (!isset($mediaInfo['url'])) return ['success' => false, 'error' => 'No URL'];
        
        $downloadUrl = $mediaInfo['url'];
    }
    
    // Descargar archivo
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $downloadUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'User-Agent: Mozilla/5.0'],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_TIMEOUT => 90, // Videos pueden ser grandes
        CURLOPT_FOLLOWLOCATION => true
    ]);
    
    $fileContent = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    
    if ($httpCode != 200 || !$fileContent) {
        return ['success' => false, 'error' => "Download failed: HTTP {$httpCode}"];
    }
    
    // Verificar que no sea HTML
    if (stripos($fileContent, '<!DOCTYPE') !== false) {
        return ['success' => false, 'error' => 'HTML response'];
    }
    
    // Determinar carpeta
    $folder = match($mediaType) {
        'image' => 'images',
        'sticker' => 'stickers',
        'audio' => 'audios',
        'video' => 'videos',
        'document' => 'documents',
        default => 'images'
    };
    
    $mediaDir = __DIR__ . '/media/' . $folder . '/';
    if (!file_exists($mediaDir)) mkdir($mediaDir, 0755, true);
    
    // Determinar extensión
    $extension = 'bin';
    
    if ($mediaType === 'sticker') {
        $extension = 'webp';
    } elseif ($mediaType === 'audio') {
        $mimeToExt = [
            'audio/ogg' => 'ogg', 'audio/mpeg' => 'mp3', 'audio/mp4' => 'm4a',
            'audio/amr' => 'amr', 'audio/wav' => 'wav', 'audio/webm' => 'webm'
        ];
        
        if ($mimeType) {
            $cleanMime = strtok($mimeType, ';');
            $extension = $mimeToExt[$cleanMime] ?? 'ogg';
        } elseif ($contentType) {
            $cleanType = strtok($contentType, ';');
            $extension = $mimeToExt[$cleanType] ?? 'ogg';
        }
    } elseif ($mediaType === 'video') {
        $mimeToExt = [
            'video/mp4' => 'mp4', 'video/3gpp' => '3gp', 'video/quicktime' => 'mov',
            'video/x-msvideo' => 'avi', 'video/webm' => 'webm'
        ];
        
        if ($mimeType) {
            $cleanMime = strtok($mimeType, ';');
            $extension = $mimeToExt[$cleanMime] ?? 'mp4';
        } elseif ($contentType) {
            $cleanType = strtok($contentType, ';');
            $extension = $mimeToExt[$cleanType] ?? 'mp4';
        }
    } elseif ($mediaType === 'document') {
        if ($mimeType && !str_contains($mimeType, '/')) {
            $ext = strtolower(pathinfo($mimeType, PATHINFO_EXTENSION));
            if ($ext) $extension = $ext;
        }
        
        if ($extension === 'bin' && $contentType) {
            $mimeMap = [
                'application/pdf' => 'pdf', 'application/msword' => 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
                'application/vnd.ms-excel' => 'xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
                'text/plain' => 'txt', 'text/csv' => 'csv', 'application/zip' => 'zip'
            ];
            $cleanType = strtok($contentType, ';');
            $extension = $mimeMap[$cleanType] ?? 'bin';
        }
    } elseif ($contentType) {
        $parts = explode('/', $contentType);
        if (count($parts) == 2) {
            $ext = strtok($parts[1], ';');
            if ($ext && $ext != 'plain') {
                $extension = ($ext == 'jpeg') ? 'jpg' : $ext;
            }
        }
    }
    
    // Nombre único
    $filename = $mediaType . '_' . time() . '_' . substr(md5($mediaId . uniqid()), 0, 8) . '.' . $extension;
    $fullPath = $mediaDir . $filename;
    
    // Guardar
    $bytesWritten = file_put_contents($fullPath, $fileContent);
    
    if (!$bytesWritten) {
        if (file_exists($fullPath)) @unlink($fullPath);
        return ['success' => false, 'error' => 'Write failed'];
    }
    
    $relativeUrl = 'media/' . $folder . '/' . $filename;
    
    file_put_contents($logFile, "✅ {$relativeUrl} ({$bytesWritten} bytes)\n", FILE_APPEND);
    
    return [
        'success' => true,
        'url' => $relativeUrl,
        'path' => $fullPath,
        'filename' => $filename,
        'size' => $bytesWritten,
        'mime_type' => $contentType ?: $mimeType,
        'media_type' => $mediaType
    ];
}
?>