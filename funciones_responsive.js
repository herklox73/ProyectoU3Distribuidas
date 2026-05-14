// ===============================================
// CAMBIAR ENTRE SECCIONES (MENSAJES, PLANTILLAS, PERFIL)
// ===============================================
function cambiarVista(vista) {
    const colConversaciones = document.getElementById('colConversaciones');
    const welcomeScreen     = document.getElementById('welcomeScreen');
    const colChat           = document.getElementById('colChat');
    const colPlantillas     = document.getElementById('colPlantillas');
    const colPerfil         = document.getElementById('colPerfil');
    const colInfo           = document.getElementById('colInfo');
    const colOportunidades  = document.getElementById('colOportunidades');
    const colReportes       = document.getElementById('colReportes');

    const esLayoutSingle = window.innerWidth < 1200;

    // OCULTAR TODO
    [colConversaciones, welcomeScreen, colChat, colPlantillas, colPerfil, colOportunidades, colReportes].forEach(el => {
        if (el) el.style.setProperty('display', 'none', 'important');
    });
    if (colInfo) colInfo.classList.add('d-none');

    // LÓGICA POR VISTA
    if (vista === 'mensajes') {
        if (esLayoutSingle) {
            if (colConversaciones) colConversaciones.style.setProperty('display', 'block', 'important');
        } else {
            if (colConversaciones) colConversaciones.style.setProperty('display', 'block', 'important');
            if (welcomeScreen)     welcomeScreen.style.setProperty('display', 'block', 'important');
        }
    }
    else if (vista === 'plantillas') {
        if (colPlantillas) colPlantillas.style.setProperty('display', 'block', 'important');
    }
    else if (vista === 'oportunidades') {
        if (colOportunidades) {
            colOportunidades.style.setProperty('display', 'block', 'important');
            oportInit();
        }
    }
    else if (vista === 'perfil') {
        if (esLayoutSingle) {
            if (colPerfil) colPerfil.style.setProperty('display', 'block', 'important');
        } else {
            if (colPerfil)     colPerfil.style.setProperty('display', 'block', 'important');
            if (welcomeScreen) welcomeScreen.style.setProperty('display', 'block', 'important');
        }
    }
    else if (vista === 'reportes') {
        if (colReportes) {
            colReportes.style.setProperty('display', 'flex', 'important');
            // Recargar el iframe solo si ya fue cargado antes (lazy refresh)
            const iframe = document.getElementById('iframeReportes');
            if (iframe && !iframe.dataset.loaded) {
                iframe.dataset.loaded = '1';
            }
        }
    }

    actualizarEstadoBotones(vista);
}

// También actualiza mostrarChat para que oculte la lista en MD y LG
function mostrarChat() {
    const esLayoutSingle = window.innerWidth < 1200;
    const colConversaciones = document.getElementById('colConversaciones');
    const colChat = document.getElementById('colChat');
    const welcomeScreen = document.getElementById('welcomeScreen');

    if (esLayoutSingle) {
        if (colConversaciones) colConversaciones.style.display = 'none';
        if (colChat) colChat.style.display = 'block';
    } else {
        if (colConversaciones) colConversaciones.style.display = 'block';
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (colChat) colChat.style.display = 'block';
    }
}

// Escuchar el cambio de tamaño de pantalla
window.addEventListener('resize', () => {
    const vistaActiva = document.querySelector('.menu-horizontal-btn.active, .template-menu-btn.active')?.id;
    
    if (vistaActiva) {
        if (vistaActiva.includes('Mensajes'))  cambiarVista('mensajes');
        if (vistaActiva.includes('Plantillas'))cambiarVista('plantillas');
        if (vistaActiva.includes('Perfil'))    cambiarVista('perfil');
        if (vistaActiva.includes('Reportes'))  cambiarVista('reportes');
    }
});

function actualizarEstadoBotones(vista) {
    const botones = {
        mensajes:  [document.getElementById('btnMensajes'),  document.getElementById('btnMensajesMobile')],
        plantillas:[document.getElementById('btnPlantillas'),document.getElementById('btnPlantillasMobile')],
        perfil:    [document.getElementById('btnPerfil'),    document.getElementById('btnPerfilMobile')],
        reportes:  [document.getElementById('btnReportes'),  document.getElementById('btnReportesMobile')]
    };

    Object.values(botones).forEach(parDeBotones => {
        parDeBotones.forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
    });

    if (botones[vista]) {
        botones[vista].forEach(btn => {
            if (btn) btn.classList.add('active');
        });
    }
}

function toggleInfo() {
    const colInfo = document.getElementById('colInfo');
    const colChat = document.getElementById('colChat');
    const esLayoutSingle = window.innerWidth < 1200;

    if (!colInfo) return;

    if (colInfo.classList.contains('d-none')) {
        // --- ABRIR PANEL ---
        colInfo.classList.remove('d-none');
        colInfo.style.setProperty('display', 'block', 'important');
        
        if (esLayoutSingle && colChat) {
            // En SM, MD, LG: El panel ocupa el lugar del chat
            colChat.style.setProperty('display', 'none', 'important');
        }
    } else {
        // --- CERRAR PANEL ---
        colInfo.classList.add('d-none');
        colInfo.style.setProperty('display', 'none', 'important');
        
        if (esLayoutSingle && colChat) {
            // Al cerrar en pantallas pequeñas, devolvemos el chat
            colChat.style.setProperty('display', 'block', 'important');
        }
    }
}

// NUEVO: Corregir el layout si el usuario estira/encoge la pantalla con el panel abierto
window.addEventListener('resize', () => {
    const colInfo = document.getElementById('colInfo');
    const colChat = document.getElementById('colChat');
    const esLayoutSingle = window.innerWidth < 1200;

    if (colInfo && !colInfo.classList.contains('d-none')) {
        if (esLayoutSingle) {
            // Si se hizo pequeña la pantalla, oculta el chat para que no se encime el panel
            if (colChat) colChat.style.setProperty('display', 'none', 'important');
        } else {
            // Si se hizo grande (XL), muestra ambos
            if (colChat) colChat.style.setProperty('display', 'block', 'important');
        }
    }
});


