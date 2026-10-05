# Avvio rapido di PocketBase su Windows, senza Docker (per test in locale).
# Serve anche il sito (cartella web/) su http://localhost:8090.
# Ascolta su tutte le interfacce, così il telefono sulla stessa Wi-Fi può raggiungerlo.
$root = $PSScriptRoot
& "$root\bin\pocketbase.exe" serve --http=0.0.0.0:8090 --dir="$root\pb_data" --migrationsDir="$root\pb_migrations" --publicDir="$root\..\web"
