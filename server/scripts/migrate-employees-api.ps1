# PowerShell скрипт для миграции сотрудников
# Использование:
#   .\scripts\migrate-employees-api.ps1
#   .\scripts\migrate-employees-api.ps1 -Token "ваш_jwt_токен"

param(
    [string]$Token = ""
)

if (-not $Token) {
    Write-Host "⚠️  JWT токен не указан" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Получите токен:"
    Write-Host "  1. Откройте http://192.168.101.25:12003/admin"
    Write-Host "  2. Войдите в систему"
    Write-Host "  3. Откройте DevTools (F12) → Application → Local Storage"
    Write-Host "  4. Найдите ключ 'jwtToken' и скопируйте значение"
    Write-Host ""
    Write-Host "Затем запустите:"
    Write-Host "  .\scripts\migrate-employees-api.ps1 -Token 'ваш_токен'" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

$env:JWT_TOKEN = $Token
node scripts/migrate-employees-api.js
