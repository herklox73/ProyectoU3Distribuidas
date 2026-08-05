# Mide el RTO (tiempo de recuperación) de Swarm ante la caída de una
# réplica del frontend. Para que el dato sea representativo, corre esto
# EN PARALELO con locustfile.py o medir_async.py generando carga sobre
# el mismo host (abre otra terminal para cada uno).
#
# Uso:
#   .\chaos_rto.ps1
#
# Requisito: el stack ya desplegado (docker stack deploy ... masssend).

$servicio = "masssend_frontend"

Write-Host "Estado inicial de $servicio :"
docker service ps $servicio --filter "desired-state=running"

$taskId = (docker service ps $servicio --filter "desired-state=running" --format "{{.ID}}" | Select-Object -First 1)
if (-not $taskId) {
    Write-Host "No se encontró ninguna tarea en ejecución. ¿Está el stack desplegado?"
    exit 1
}
$containerId = docker inspect --format "{{.Status.ContainerStatus.ContainerID}}" $taskId

Write-Host "`nMatando el contenedor $containerId (tarea $taskId) ..."
$t0 = Get-Date
docker kill $containerId | Out-Null

Write-Host "Esperando a que Swarm reprograme la réplica caída (3/3 Running)..."
do {
    Start-Sleep -Milliseconds 500
    $running = (docker service ps $servicio --filter "desired-state=running" --format "{{.CurrentState}}" |
        Select-String "Running").Count
} while ($running -lt 3)

$t1 = Get-Date
$rto = ($t1 - $t0).TotalSeconds
Write-Host "`nRTO (desde el kill hasta 3/3 réplicas Running de nuevo): $rto segundos"

Write-Host "`nEstado final:"
docker service ps $servicio --filter "desired-state=running"

Write-Host "`nRepite esto varias veces (>=5) y con carga corriendo en paralelo para reportar un RTO promedio, no un solo dato suelto."
