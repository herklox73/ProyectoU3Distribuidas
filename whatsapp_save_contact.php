<?php

$objSql = new cSql;
$objEncrip = new cEncriptacion();
require_once("../../../clases/cParametros.php");
$objParam = new cParametros();
$digitador = $objEncrip->decrypt($_SESSION[$objParam->p_nombres_session]);

header('Content-Type: application/json');

try {
    // Recibir datos del POST
    $phone = trim($_POST['phone'] ?? '');
    $name = trim($_POST['name'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $company = trim($_POST['company'] ?? '');
    $notes = trim($_POST['notes'] ?? '');
    $tags = trim($_POST['tags'] ?? '');
    
    // Validar teléfono y nombre
    if (empty($phone) || empty($name)) {
        echo json_encode(['success' => false, 'message' => 'Teléfono y nombre son obligatorios']);
        exit;
    }
    
    // Limpiar teléfono (quitar espacios, guiones, etc.)
    $phone = preg_replace('/[^0-9]/', '', $phone);
    
    // Escapar datos para evitar SQL injection
    $phone_safe = addslashes($phone);
    $name_safe = addslashes($name);
    $email_safe = addslashes($email);
    $company_safe = addslashes($company);
    $notes_safe = addslashes($notes);
    $tags_safe = addslashes($tags);
    
    // Obtener cuenta de WhatsApp activa
    $whatsapp_account_id = null;
    $sqlAccount = "SELECT id FROM fm_crm_whatsapp_accounts WHERE is_active = 1 LIMIT 1";
    $rsAccount = $objSql->Select($sqlAccount);
    if ($objSql->numRows > 0) {
        $whatsapp_account_id = $rsAccount[0]['id'];
    }
    
    // Verificar si el contacto ya existe
    $sqlCheck = "SELECT id FROM fm_crm_whatsapp_contacts WHERE phone_number = '$phone_safe'";
    $rsCheck = $objSql->Select($sqlCheck);
    
    if ($objSql->numRows > 0) {
        // Contacto ya existe - ACTUALIZAR
        $contact_id = $rsCheck[0]['id'];
        
        $sqlUpdate = "UPDATE fm_crm_whatsapp_contacts SET 
            contact_name = '$name_safe',
            email = " . ($email ? "'$email_safe'" : "NULL") . ",
            company = " . ($company ? "'$company_safe'" : "NULL") . ",
            notes = " . ($notes ? "'$notes_safe'" : "NULL") . ",
            tags = " . ($tags ? "'$tags_safe'" : "NULL") . ",
            updated_at = NOW()
            WHERE id = $contact_id";
        
        $objSql->Update($sqlUpdate);
        
        echo json_encode([
            'success' => true, 
            'message' => 'Contacto actualizado exitosamente',
            'contact_id' => $contact_id,
            'action' => 'updated'
        ]);
        
    } else {
        // Contacto nuevo - INSERTAR
        $sqlInsert = "INSERT INTO fm_crm_whatsapp_contacts 
            (phone_number, contact_name, email, company, notes, tags, whatsapp_account_id, created_by, created_at)
            VALUES (
                '$phone_safe',
                '$name_safe',
                " . ($email ? "'$email_safe'" : "NULL") . ",
                " . ($company ? "'$company_safe'" : "NULL") . ",
                " . ($notes ? "'$notes_safe'" : "NULL") . ",
                " . ($tags ? "'$tags_safe'" : "NULL") . ",
                " . ($whatsapp_account_id ? $whatsapp_account_id : "NULL") . ",
                '$digitador',
                NOW()
            )";
        
        $objSql->Insert($sqlInsert);
        
        // Obtener el ID del contacto insertado
        $sqlLastId = "SELECT LAST_INSERT_ID() as id";
        $rsLastId = $objSql->Select($sqlLastId);
        $contact_id = $rsLastId[0]['id'];
        
        echo json_encode([
            'success' => true, 
            'message' => 'Contacto guardado exitosamente',
            'contact_id' => $contact_id,
            'action' => 'created'
        ]);
    }
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false, 
        'message' => 'Error al guardar: ' . $e->getMessage()
    ]);
}
?>
