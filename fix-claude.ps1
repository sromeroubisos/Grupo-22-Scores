# Arregla el ConnectionRefused causado por el proxy de Headroom
# Backup automatico. No borra nada sin copia previa.

$ErrorActionPreference = 'Continue'
$settings = Join-Path $env:USERPROFILE '.claude\settings.json'
$stamp    = Get-Date -Format 'yyyyMMdd-HHmmss'

Write-Host "`n=== 1. Estado actual ===" -ForegroundColor Cyan
if (-not (Test-Path $settings)) {
    Write-Host "No existe $settings" -ForegroundColor Yellow
} else {
    Get-Content $settings -Raw | Write-Host
    Copy-Item $settings "$settings.backup-$stamp"
    Write-Host "`nBackup -> $settings.backup-$stamp" -ForegroundColor Green

    $json = Get-Content $settings -Raw | ConvertFrom-Json
    $cambios = @()

    # --- quitar ANTHROPIC_BASE_URL / AUTH_TOKEN del bloque env ---
    if ($json.PSObject.Properties.Name -contains 'env' -and $json.env) {
        foreach ($k in @('ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_API_KEY')) {
            if ($json.env.PSObject.Properties.Name -contains $k) {
                $cambios += "env.$k = $($json.env.$k)"
                $json.env.PSObject.Properties.Remove($k)
            }
        }
        if (-not $json.env.PSObject.Properties.Name) { $json.PSObject.Properties.Remove('env') }
    }

    # --- quitar hooks que llamen a headroom ---
    if ($json.PSObject.Properties.Name -contains 'hooks' -and $json.hooks) {
        foreach ($evento in @($json.hooks.PSObject.Properties.Name)) {
            $grupos = @($json.hooks.$evento) | Where-Object {
                $txt = ($_ | ConvertTo-Json -Depth 10 -Compress)
                $txt -notmatch 'headroom'
            }
            if ($grupos.Count -ne @($json.hooks.$evento).Count) {
                $cambios += "hooks.$evento : saque los que llamaban a headroom"
            }
            if ($grupos.Count -eq 0) { $json.hooks.PSObject.Properties.Remove($evento) }
            else { $json.hooks.$evento = $grupos }
        }
        if (-not $json.hooks.PSObject.Properties.Name) { $json.PSObject.Properties.Remove('hooks') }
    }

    if ($cambios.Count -eq 0) {
        Write-Host "`nNo encontre rastros de Headroom en settings.json." -ForegroundColor Yellow
        Write-Host "Si el error sigue, puede estar wrapeado de otra forma (ver paso 2)."
    } else {
        Write-Host "`n=== 2. Saco esto ===" -ForegroundColor Cyan
        $cambios | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
        $out = $json | ConvertTo-Json -Depth 20
        [System.IO.File]::WriteAllText($settings, $out, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "settings.json actualizado." -ForegroundColor Green
    }
}

Write-Host "`n=== 3. Desinstalo Headroom ===" -ForegroundColor Cyan
if (Get-Command headroom -ErrorAction SilentlyContinue) {
    headroom unwrap claude
    headroom install remove --profile init-user
    if (Get-Command uv -ErrorAction SilentlyContinue) { uv tool uninstall headroom-ai }
} else {
    Write-Host "El comando 'headroom' no esta en el PATH, salteo este paso."
}

Write-Host "`n=== 4. Puerto 8787 (deberia estar vacio) ===" -ForegroundColor Cyan
$p = netstat -ano | Select-String ':8787'
if ($p) { $p } else { Write-Host "Nadie escuchando en 8787. Correcto." -ForegroundColor Green }

Write-Host "`n=== 5. Actualizo Claude Code ===" -ForegroundColor Cyan
npm install -g @anthropic-ai/claude-code@latest

Write-Host "`n=== 6. Verificacion ===" -ForegroundColor Cyan
Write-Host "Version: " -NoNewline; claude --version
Write-Host "Conectividad a la API: " -NoNewline
$r = Test-NetConnection api.anthropic.com -Port 443 -WarningAction SilentlyContinue
if ($r.TcpTestSucceeded) { Write-Host "OK" -ForegroundColor Green } else { Write-Host "FALLA" -ForegroundColor Red }

Write-Host "`nListo. Cerra TODAS las ventanas de Claude Code y abri una nueva.`n" -ForegroundColor Cyan
