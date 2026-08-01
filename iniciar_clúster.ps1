# Script de arranque rápido para la defensa — MassSend
# Uso: clic derecho -> "Ejecutar con PowerShell", o desde una terminal:
#   powershell -ExecutionPolicy Bypass -File .\iniciar_clúster.ps1

Set-Location "D:\Carlos Asus\Descargas\Distribuidas whasapp\whatsApp"

Write-Host "== Verificando/creando el Swarm ==" -ForegroundColor Cyan
docker swarm init 2>$null | Out-Null
# Si ya existía (o el comando anterior falló porque ya estás en un swarm), no pasa nada: seguimos.

Write-Host "== Desplegando el stack ==" -ForegroundColor Cyan
docker stack deploy --resolve-image never -c stack.yml masssend

Write-Host "== Esperando a que los servicios levanten (20s) ==" -ForegroundColor Cyan
Start-Sleep -Seconds 20

Write-Host "== Estado del clúster ==" -ForegroundColor Green
docker stack services masssend

Write-Host ""
Write-Host "Si 'masssend_ollama' sigue en 0/1, espera unos segundos más y corre:" -ForegroundColor Yellow
Write-Host "  docker stack services masssend" -ForegroundColor Yellow
Write-Host ""
Write-Host "App: http://localhost:5173" -ForegroundColor Green
