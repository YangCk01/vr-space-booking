cd D:\VR\server
$env:PORT=4000
Write-Host "Starting test server on port 4000..." -ForegroundColor Green
npx tsx src/server.ts
