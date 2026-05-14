<?php
session_start();
require_once 'config.php';
require_once 'functions.php';
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reportes — MassSend</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        body { background: #f4f6fb; }

        .stat-card {
            border: none;
            border-radius: 16px;
            padding: 20px 22px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.07);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .stat-card:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,0.11); }

        .stat-icon {
            width: 48px; height: 48px;
            border-radius: 14px;
            display: flex; align-items: center; justify-content: center;
            font-size: 22px;
        }

        .stat-value { font-size: 2rem; font-weight: 700; line-height: 1; }
        .stat-label { font-size: 0.8rem; color: #8696a0; font-weight: 500; margin-top: 4px; }
        .stat-sub   { font-size: 0.75rem; font-weight: 600; margin-top: 6px; }

        /* Badges de estado */
        .badge-sent      { background: #e8f0fe; color: #1a73e8; }
        .badge-delivered { background: #e6f4ea; color: #188038; }
        .badge-read      { background: #e3f9fd; color: #0097a7; }
        .badge-failed    { background: #fce8e6; color: #c5221f; }
        .badge-pending   { background: #fef3e2; color: #e37400; }

        .chart-card {
            background: #fff;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.07);
        }

        .table-card {
            background: #fff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 2px 12px rgba(0,0,0,0.07);
        }

        .table-card .table { margin-bottom: 0; }
        .table-card .table thead th {
            background: #f8f9fa;
            font-size: 0.78rem;
            font-weight: 600;
            color: #667781;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            border-bottom: 1px solid #e9ecef;
        }

        .table-card .table tbody td { font-size: 0.85rem; vertical-align: middle; }

        .tick-icon { font-size: 0.95rem; }
        .tick-sent      { color: #8696a0; }
        .tick-delivered { color: #8696a0; }
        .tick-read      { color: #34b7f1; }
        .tick-failed    { color: #c5221f; }
        .tick-pending   { color: #e37400; }

        .progress-bar-read { background: #34b7f1; }
        .progress-bar-delivered { background: #188038; }

        .section-title {
            font-size: 0.9rem;
            font-weight: 700;
            color: #667781;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 14px;
        }

        #loadingOverlay {
            position: fixed; inset: 0;
            background: rgba(255,255,255,0.8);
            z-index: 9999;
            display: flex; align-items: center; justify-content: center;
        }

        .navbar-rep {
            background: #fff;
            border-bottom: 1px solid #e9ecef;
            padding: 12px 24px;
        }
    </style>
</head>
<body>

<!-- Navbar -->
<nav class="navbar-rep d-flex align-items-center justify-content-between mb-0">
    <div class="d-flex align-items-center gap-3">
        <a href="index.php" class="btn btn-sm btn-outline-secondary">
            <i class="fas fa-arrow-left me-1"></i> Volver
        </a>
        <h5 class="mb-0 fw-bold" style="color:#1a1a2e;">
            <i class="fas fa-chart-bar me-2 text-primary"></i>Reportes de Mensajería
        </h5>
    </div>
    <div class="d-flex align-items-center gap-2">
        <input type="date" id="filtroDesde" class="form-control form-control-sm" style="max-width:140px;">
        <span class="text-muted small">a</span>
        <input type="date" id="filtroHasta" class="form-control form-control-sm" style="max-width:140px;">
        <button class="btn btn-sm btn-primary" onclick="cargarDatos()">
            <i class="fas fa-sync-alt me-1"></i> Actualizar
        </button>
    </div>
</nav>

<!-- Loading overlay -->
<div id="loadingOverlay">
    <div class="text-center">
        <div class="spinner-border text-primary" style="width:2.5rem;height:2.5rem;"></div>
        <div class="mt-3 fw-semibold text-muted">Cargando estadísticas...</div>
    </div>
</div>

<div class="container-fluid py-4 px-4">

    <!-- ===== TARJETAS DE RESUMEN ===== -->
    <div class="row g-3 mb-4" id="tarjetasResumen">

        <div class="col-6 col-md-3">
            <div class="stat-card bg-white">
                <div class="d-flex align-items-center gap-3 mb-2">
                    <div class="stat-icon" style="background:#e8f0fe;">
                        <i class="fas fa-paper-plane" style="color:#1a73e8;"></i>
                    </div>
                    <div>
                        <div class="stat-value text-dark" id="valEnviados">—</div>
                        <div class="stat-label">Mensajes enviados</div>
                    </div>
                </div>
                <div class="stat-sub text-muted" id="subEnviados">— recibidos</div>
            </div>
        </div>

        <div class="col-6 col-md-3">
            <div class="stat-card bg-white">
                <div class="d-flex align-items-center gap-3 mb-2">
                    <div class="stat-icon" style="background:#e6f4ea;">
                        <i class="fas fa-check-double" style="color:#188038;"></i>
                    </div>
                    <div>
                        <div class="stat-value text-dark" id="valEntregados">—</div>
                        <div class="stat-label">Entregados</div>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-1 mt-2">
                    <div class="progress flex-grow-1" style="height:5px;border-radius:4px;">
                        <div class="progress-bar progress-bar-delivered" id="progEntregados" style="width:0%;"></div>
                    </div>
                    <span class="stat-sub text-success" id="pctEntregados">0%</span>
                </div>
            </div>
        </div>

        <div class="col-6 col-md-3">
            <div class="stat-card bg-white">
                <div class="d-flex align-items-center gap-3 mb-2">
                    <div class="stat-icon" style="background:#e3f9fd;">
                        <i class="fas fa-eye" style="color:#0097a7;"></i>
                    </div>
                    <div>
                        <div class="stat-value text-dark" id="valLeidos">—</div>
                        <div class="stat-label">Leídos (visto)</div>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-1 mt-2">
                    <div class="progress flex-grow-1" style="height:5px;border-radius:4px;">
                        <div class="progress-bar progress-bar-read" id="progLeidos" style="width:0%;"></div>
                    </div>
                    <span class="stat-sub" style="color:#0097a7;" id="pctLeidos">0%</span>
                </div>
            </div>
        </div>

        <div class="col-6 col-md-3">
            <div class="stat-card bg-white">
                <div class="d-flex align-items-center gap-3 mb-2">
                    <div class="stat-icon" style="background:#fce8e6;">
                        <i class="fas fa-times-circle" style="color:#c5221f;"></i>
                    </div>
                    <div>
                        <div class="stat-value text-dark" id="valFallidos">—</div>
                        <div class="stat-label">Fallidos</div>
                    </div>
                </div>
                <div class="stat-sub text-danger" id="subFallidos">0% de error</div>
            </div>
        </div>

    </div>

    <!-- ===== GRÁFICAS ===== -->
    <div class="row g-3 mb-4">

        <!-- Gráfica de líneas: mensajes por día -->
        <div class="col-12 col-lg-8">
            <div class="chart-card">
                <div class="section-title">Actividad diaria</div>
                <canvas id="chartLineas" height="90"></canvas>
            </div>
        </div>

        <!-- Gráfica de dona: distribución de estados -->
        <div class="col-12 col-lg-4">
            <div class="chart-card">
                <div class="section-title">Distribución de estados</div>
                <canvas id="chartDona" height="200"></canvas>
                <div id="leyendaEstados" class="mt-3 d-flex flex-wrap justify-content-center gap-2"></div>
            </div>
        </div>

    </div>

    <!-- ===== TOP CONTACTOS ===== -->
    <div class="row g-3 mb-4">
        <div class="col-12 col-md-5">
            <div class="table-card">
                <div class="p-3 border-bottom">
                    <div class="section-title mb-0">Top contactos (por mensajes enviados)</div>
                </div>
                <div class="table-responsive" style="max-height:320px;overflow-y:auto;">
                    <table class="table table-hover">
                        <thead><tr>
                            <th>#</th>
                            <th>Contacto</th>
                            <th class="text-center">Msgs</th>
                            <th class="text-center">Leídos</th>
                        </tr></thead>
                        <tbody id="tablaTop"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ===== TABLA DE MENSAJES ===== -->
        <div class="col-12 col-md-7">
            <div class="table-card">
                <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
                    <div class="section-title mb-0">Mensajes enviados recientes</div>
                    <div class="d-flex gap-2 align-items-center">
                        <input type="text" id="filtroTabla" class="form-control form-control-sm" placeholder="Buscar..." style="max-width:160px;" oninput="filtrarTabla()">
                        <select id="filtroStatus" class="form-select form-select-sm" style="max-width:130px;" onchange="filtrarTabla()">
                            <option value="">Todos los estados</option>
                            <option value="sent">Enviado</option>
                            <option value="delivered">Entregado</option>
                            <option value="read">Leído</option>
                            <option value="failed">Fallido</option>
                            <option value="pending">Pendiente</option>
                        </select>
                    </div>
                </div>
                <div class="table-responsive" style="max-height:320px;overflow-y:auto;">
                    <table class="table table-hover">
                        <thead><tr>
                            <th>Contacto</th>
                            <th>Mensaje</th>
                            <th class="text-center">Estado</th>
                            <th>Fecha</th>
                        </tr></thead>
                        <tbody id="tablaMensajes"></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

</div>

<script>
// ============================================
// DATOS GLOBALES
// ============================================
let datosGlobales = null;
let chartLineas = null;
let chartDona   = null;

// ============================================
// INICIALIZAR FECHAS
// ============================================
document.addEventListener('DOMContentLoaded', function () {
    const hoy = new Date();
    const hace30 = new Date();
    hace30.setDate(hoy.getDate() - 30);

    document.getElementById('filtroDesde').value = hace30.toISOString().split('T')[0];
    document.getElementById('filtroHasta').value = hoy.toISOString().split('T')[0];

    cargarDatos();
});

// ============================================
// CARGAR DATOS DESDE BACKEND
// ============================================
function cargarDatos() {
    const desde = document.getElementById('filtroDesde').value;
    const hasta = document.getElementById('filtroHasta').value;

    document.getElementById('loadingOverlay').style.display = 'flex';

    fetch(`reportes_data.php?desde=${desde}&hasta=${hasta}`)
        .then(r => r.json())
        .then(data => {
            datosGlobales = data;
            renderizarTarjetas(data.resumen);
            renderizarChartLineas(data.por_dia);
            renderizarChartDona(data.resumen);
            renderizarTablaTop(data.top_contactos);
            renderizarTablaMensajes(data.mensajes);
            document.getElementById('loadingOverlay').style.display = 'none';
        })
        .catch(err => {
            console.error(err);
            document.getElementById('loadingOverlay').style.display = 'none';
        });
}

// ============================================
// TARJETAS DE RESUMEN
// ============================================
function renderizarTarjetas(r) {
    document.getElementById('valEnviados').textContent   = r.enviados.toLocaleString();
    document.getElementById('subEnviados').textContent   = r.recibidos.toLocaleString() + ' recibidos';
    document.getElementById('valEntregados').textContent = r.entregados.toLocaleString();
    document.getElementById('valLeidos').textContent     = r.leidos.toLocaleString();
    document.getElementById('valFallidos').textContent   = r.fallidos.toLocaleString();

    const pctEnt = r.tasa_entrega;
    const pctLec = r.tasa_lectura;
    const pctFal = r.enviados > 0 ? Math.round(r.fallidos / r.enviados * 100) : 0;

    document.getElementById('progEntregados').style.width = pctEnt + '%';
    document.getElementById('progLeidos').style.width     = pctLec + '%';
    document.getElementById('pctEntregados').textContent  = pctEnt + '%';
    document.getElementById('pctLeidos').textContent      = pctLec + '%';
    document.getElementById('subFallidos').textContent    = pctFal + '% de error';
}

// ============================================
// CHART: LÍNEAS POR DÍA
// ============================================
function renderizarChartLineas(porDia) {
    const labels    = porDia.map(d => {
        const parts = d.dia.split('-');
        return `${parts[2]}/${parts[1]}`;
    });
    const enviados  = porDia.map(d => d.enviados);
    const recibidos = porDia.map(d => d.recibidos);

    if (chartLineas) chartLineas.destroy();

    const ctx = document.getElementById('chartLineas').getContext('2d');
    chartLineas = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Enviados',
                    data: enviados,
                    borderColor: '#1a73e8',
                    backgroundColor: 'rgba(26,115,232,0.08)',
                    borderWidth: 2.5,
                    pointRadius: 3,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Recibidos',
                    data: recibidos,
                    borderColor: '#34b7f1',
                    backgroundColor: 'rgba(52,183,241,0.06)',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top' } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: { beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 } } }
            }
        }
    });
}

// ============================================
// CHART: DONA DE ESTADOS
// ============================================
function renderizarChartDona(r) {
    if (chartDona) chartDona.destroy();

    const datos  = [r.leidos, r.entregados, r.st_sent, r.fallidos, r.pendientes];
    const labels = ['Leídos', 'Entregados', 'Enviados', 'Fallidos', 'Pendientes'];
    const colores = ['#34b7f1', '#188038', '#8696a0', '#c5221f', '#e37400'];

    const ctx = document.getElementById('chartDona').getContext('2d');
    chartDona = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: datos,
                backgroundColor: colores,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct   = total > 0 ? Math.round(ctx.parsed / total * 100) : 0;
                            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Leyenda personalizada
    const leyenda = document.getElementById('leyendaEstados');
    leyenda.innerHTML = labels.map((l, i) => `
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.78rem;color:#555;">
            <span style="width:10px;height:10px;border-radius:50%;background:${colores[i]};display:inline-block;"></span>
            ${l}: <strong>${datos[i]}</strong>
        </span>
    `).join('');
}

// ============================================
// TABLA TOP CONTACTOS
// ============================================
function renderizarTablaTop(top) {
    const tbody = document.getElementById('tablaTop');
    if (!top || top.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Sin datos</td></tr>';
        return;
    }
    tbody.innerHTML = top.map((c, i) => {
        const pctLec = c.total > 0 ? Math.round(c.leidos / c.total * 100) : 0;
        return `
        <tr>
            <td class="text-muted fw-bold">${i + 1}</td>
            <td>
                <div class="fw-semibold" style="font-size:0.85rem;">${escHTML(c.nombre)}</div>
                <div class="text-muted" style="font-size:0.72rem;">+${escHTML(c.phone)}</div>
            </td>
            <td class="text-center fw-bold">${c.total}</td>
            <td class="text-center">
                <span style="color:#34b7f1; font-weight:600;">${c.leidos}</span>
                <div class="text-muted" style="font-size:0.7rem;">${pctLec}%</div>
            </td>
        </tr>`;
    }).join('');
}

// ============================================
// TABLA MENSAJES ENVIADOS
// ============================================
let mensajesCacheados = [];

function renderizarTablaMensajes(msgs) {
    mensajesCacheados = msgs;
    filtrarTabla();
}

function filtrarTabla() {
    const termino = document.getElementById('filtroTabla').value.toLowerCase();
    const status  = document.getElementById('filtroStatus').value;

    const filtrados = mensajesCacheados.filter(m => {
        const coinc = !termino ||
            (m.contacto || '').toLowerCase().includes(termino) ||
            (m.phone    || '').includes(termino) ||
            (m.texto    || '').toLowerCase().includes(termino);
        const estOk = !status || m.status === status;
        return coinc && estOk;
    });

    const tbody = document.getElementById('tablaMensajes');
    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Sin resultados</td></tr>';
        return;
    }

    tbody.innerHTML = filtrados.map(m => {
        const badgeInfo = {
            sent:      { cls:'badge-sent',      icon:'✓',  label:'Enviado' },
            delivered: { cls:'badge-delivered', icon:'✓✓', label:'Entregado' },
            read:      { cls:'badge-read',      icon:'✓✓', label:'Leído' },
            failed:    { cls:'badge-failed',    icon:'✗',  label:'Fallido' },
            pending:   { cls:'badge-pending',   icon:'⏳', label:'Pendiente' }
        };
        const b = badgeInfo[m.status] || { cls:'badge-pending', icon:'?', label: m.status };
        const isRead = m.status === 'read';

        const fecha = m.fecha ? m.fecha.substring(0, 16).replace('T',' ') : '—';

        return `
        <tr>
            <td>
                <div class="fw-semibold" style="font-size:0.85rem;">${escHTML(m.contacto)}</div>
                <div class="text-muted" style="font-size:0.72rem;">+${escHTML(m.phone)}</div>
            </td>
            <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.82rem;" title="${escHTML(m.texto)}">
                ${escHTML(m.texto) || '<span class="text-muted">[Sin texto]</span>'}
            </td>
            <td class="text-center">
                <span class="badge ${b.cls} px-2 py-1 rounded-pill" style="font-size:0.72rem;">
                    <span style="${isRead ? 'color:#34b7f1;' : ''}">${b.icon}</span> ${b.label}
                </span>
            </td>
            <td style="font-size:0.78rem; color:#667781; white-space:nowrap;">${escHTML(fecha)}</td>
        </tr>`;
    }).join('');
}

function escHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
</script>
</body>
</html>
