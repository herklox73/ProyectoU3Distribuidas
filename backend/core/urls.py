"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from mass_sender import views as ms_views

admin.site.site_header = 'MassSend - Panel de Control'
admin.site.site_title = 'MassSend Admin'
admin.site.index_title = 'Gestión de Mensajería'

urlpatterns = [
    # Vistas personalizadas dentro del admin (sidebar siempre visible)
    path('admin/chat/', admin.site.admin_view(ms_views.chat_embed_view), name='admin_chat'),
    path('admin/reportes/', admin.site.admin_view(ms_views.reportes_view), name='admin_reportes'),
    path('admin/import-contacts/', admin.site.admin_view(ms_views.import_contacts), name='admin_import_contacts'),
    path('admin/cambiar-numero/', admin.site.admin_view(ms_views.cambiar_numero_admin_view), name='admin_cambiar_numero'),
    path('admin/', admin.site.urls),
    path('whatsapp/', include('mass_sender.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
