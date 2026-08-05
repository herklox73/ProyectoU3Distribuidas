# Version combinada: mide el RTO (orquestador) Y la disponibilidad
# observada por el cliente (sonda HTTP) EN UNA SOLA TERMINAL, para
# eliminar el problema de sincronizar dos ventanas a mano.
#
# Que hace:
#   1. Lanza la sonda HTTP contra el frontend en segundo plano (background job).
#   2. Espera 3 segundos (para tener "antes" limpio en el CSV).
#   3. Mata una replica del frontend y mide el RTO igual que chaos_rto.ps1.
#   4. Espera a que la sonda termine sus 20s y guarda el CSV.
#
# Uso:
#   cd benchmark
#   .\chaos_rto_con_sonda.ps1
#
# Requisito: el stack ya desplegado (docker stack deploy ... masssend).

param(
    [int]$DurationSeconds = 20,
    [int]$IntervalMs = 100,
    [string]$Url = "http://localhost:5173",
    [string]$Servicio = "masssend_frontend"
)

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outFile = Join-Path (Get-Location) "probe_run_$stamp.csv"

$scriptBlock = {
    param($Url, $IntervalMs, $DurationSeconds, $outFile)
    "elapsed_ms,success,status_code,latency_ms" | Out-File -FilePath $outFile -Encoding utf8
    $t0 = Get-Date
    $deadline = $t0.AddSeconds($DurationSeconds)
    while ((Get-Date) -lt $deadline) {
        $reqStart = Get-Date
        $elapsedMs = [math]::Round(((Get-Date) - $t0).TotalMilliseconds)
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            $latencyMs = [math]::Round(((Get-Date) - $reqStart).TotalMilliseconds)
            $ok = 1
            $code = $resp.StatusCode
        } catch {
            $latencyMs = [math]::Round(((Get-Date) - $reqStart).TotalMilliseconds)
            $ok = 0
            $code = 0
        }
        "$elapsedMs,$ok,$code,$latencyMs" | Out-File -FilePath $outFile -Append -Encoding utf8
        Start-Sleep -Milliseconds $IntervalMs
    }
}

Write-Host "Iniciando sonda en segundo plano contra $Url ..."
Write-Host "Archivo de salida: $outFile"
$job = Start-Job -ScriptBlock $scriptBlock -ArgumentList $Url, $IntervalMs, $DurationSeconds, $outFile

Write-Host "Esperando 3 segundos (linea base 'antes' del kill)..."
Start-Sleep -Seconds 3

Write-Host "`nEstado inicial de $Servicio :"
docker service ps $Servicio --filter "desired-state=running"

$taskId = (docker service ps $Servicio --filter "desired-state=running" --format "{{.ID}}" | Select-Object -First 1)
if (-not $taskId) {
    Write-Host "No se encontro ninguna tarea en ejecucion. Aborta."
    Wait-Job $job | Out-Null
    Remove-Job $job
    exit 1
}
$containerId = docker inspect --format "{{.Status.ContainerStatus.ContainerID}}" $taskId

Write-Host "`nMatando el contenedor $containerId (tarea $taskId) ..."
$t0k = Get-Date
docker kill $containerId | Out-Null

Write-Host "Esperando a que Swarm reprograme la replica caida (3/3 Running)..."
do {
    Start-Sleep -Milliseconds 500
    $running = (docker service ps $Servicio --filter "desired-state=running" --format "{{.CurrentState}}" |
        Select-String "Running").Count
} while ($running -lt 3)
$t1k = Get-Date
$rto = ($t1k - $t0k).TotalSeconds

Write-Host "`nRTO (orquestador, desde el kill hasta 3/3 Running de nuevo): $rto segundos"
Write-Host "`nEstado final:"
docker service ps $Servicio --filter "desired-state=running"

Write-Host "`nEsperando a que la sonda termine sus $DurationSeconds s totales..."
Wait-Job $job | Out-Null
Receive-Job $job | Out-Null
Remove-Job $job

# Guarda el RTO junto al CSV para no perder la referencia
"rto_orquestador_segundos,$rto" | Out-File -FilePath ($outFile -replace '\.csv$', '_rto.txt') -Encoding utf8

Write-Host "`nListo."
Write-Host "  - CSV de la sonda: $outFile"
Write-Host "  - RTO del orquestador: $rto s (tambien guardado en $($outFile -replace '\.csv$', '_rto.txt'))"
Write-Host "Copia ambos archivos, los vamos a analizar juntos."
