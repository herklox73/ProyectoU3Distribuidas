# Sonda de disponibilidad desde el punto de vista del CLIENTE.
#
# A diferencia de chaos_rto.ps1 (que mide el RTO preguntandole al
# orquestador "cuando vuelve a decir 3/3 Running"), este script no le
# pregunta nada a Docker: se comporta como un usuario real, golpeando
# el frontend publicado (puerto 5173, detras del ingress mesh de Swarm)
# una y otra vez, y registra si cada intento tuvo exito o fallo y
# cuanto tardo. Sirve para responder la pregunta real: "el usuario
# efectivamente se quedo sin servicio, o el balanceo de Swarm lo cubrio?"
#
# Uso (correr en una terminal aparte, ANTES de lanzar chaos_rto.ps1 en
# otra terminal, para capturar el antes/durante/despues del kill):
#   cd benchmark
#   .\probe_disponibilidad.ps1 -DurationSeconds 20 -IntervalMs 100
#
# Al terminar escribe un CSV: probe_run_<timestamp>.csv

param(
    [int]$DurationSeconds = 20,
    [int]$IntervalMs = 100,
    [string]$Url = "http://localhost:5173"
)

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outFile = "probe_run_$stamp.csv"
"elapsed_ms,success,status_code,latency_ms" | Out-File -FilePath $outFile -Encoding utf8

Write-Host "Sondeando $Url cada $IntervalMs ms durante $DurationSeconds s ..."
Write-Host "Lanza chaos_rto.ps1 en la OTRA terminal ahora (o en 1-2 segundos)."
Write-Host "Guardando en $outFile"

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

Write-Host "`nListo. Revisa $outFile"
Write-Host "Copia ese archivo, lo vamos a analizar juntos."
