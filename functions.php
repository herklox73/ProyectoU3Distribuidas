<?php
// Función para llamadas a Graph API con manejo de errores
function callGraphAPI($endpoint, $accessToken) {
    $sep = (strpos($endpoint, '?') !== false) ? '&' : '?';
    $url = API_BASE_URL . $endpoint . $sep . "access_token=" . $accessToken;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        $error_msg = curl_error($ch);
        curl_close($ch);
        http_response_code(500);
        die(json_encode(["error" => "Error de conexión cURL: $error_msg"]));
    }

    curl_close($ch);
    $data = json_decode($response, true);

    if (isset($data["error"])) {
        // Guardar en archivo log para revisar
        file_put_contents(__DIR__ . "/error_log.txt", print_r($data, true), FILE_APPEND);

        http_response_code(400);
        die("<pre>Graph API ERROR:\n" . print_r($data, true) . "\nURL: $url</pre>");
    }


    return $data;
}

function obtenerPageAccessToken($systemUserToken, $pageId) {
    $accounts = callGraphAPI("me/accounts", $systemUserToken);
    if (!isset($accounts['data'])) return null;
    foreach ($accounts['data'] as $acc) {
        if ($acc['id'] == $pageId) return $acc['access_token'];
    }
    return null;
}

