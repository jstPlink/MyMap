# Crea o aggiorna l'admin di PocketBase chiedendo email e password a terminale.
# Uso: powershell -ExecutionPolicy Bypass -File pocketbase\set-admin.ps1
$root = $PSScriptRoot
$email = Read-Host "Email admin"
$pw = Read-Host "Password (min 10 caratteri)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
& "$root\bin\pocketbase.exe" superuser upsert $email $plain --dir="$root\pb_data"
