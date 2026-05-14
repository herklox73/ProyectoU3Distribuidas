from django.urls import path
from . import views

app_name = 'mass_sender'

urlpatterns = [
    path('chat/', views.chat_view, name='chat'),
    path('chat/leer_mensajes.php', views.api_leer_mensajes, name='api_leer_mensajes'),
    path('chat/enviar_whatsapp.php', views.api_enviar_whatsapp, name='api_enviar_whatsapp'),
    path('api/webhook/', views.api_webhook, name='api_webhook'),
    path('chat/get_whatsapp_profile.php', views.dummy_success),
    path('chat/eliminar_contacto.php', views.dummy_success),
    path('chat/disconnect_whatsapp.php', views.dummy_success),
    path('chat/marcar_leido.php', views.dummy_success),
    path('chat/enviar_imagen_whatsapp.php', views.dummy_success),
    path('chat/guardar_contacto.php', views.dummy_success),
    path('chat/enviar_audio_whatsapp.php', views.dummy_success),
    path('chat/enviar_documento_whatsapp.php', views.dummy_success),
    path('chat/eliminar_chat.php', views.dummy_success),
    path('import-contacts/', views.import_contacts, name='import_contacts'),
    path('api/reportes/', views.api_reportes, name='api_reportes'),
    path('reportes/', views.reportes_view, name='reportes'),
    # Progreso de campaña en tiempo real
    path('api/campaign-progress/<int:campaign_id>/', views.api_campaign_progress, name='api_campaign_progress'),
    # Monitor en tiempo real
    path('monitor/<int:campaign_id>/', views.campaign_monitor_view, name='campaign_monitor'),
    # ACK de entrega/lectura (llamado por Node.js)
    path('api/message-ack/', views.api_message_ack, name='api_message_ack'),
    # Cambiar número de WhatsApp (cerrar sesión en Node.js)
    path('api/cambiar-numero/', views.api_cambiar_numero, name='api_cambiar_numero'),
    # Proxy: devuelve QR actual desde Node.js
    path('api/qr-status/', views.api_qr_status, name='api_qr_status'),
    # Solicitar código de vinculación por número de teléfono
    path('api/request-pairing/', views.api_request_pairing, name='api_request_pairing'),
]
