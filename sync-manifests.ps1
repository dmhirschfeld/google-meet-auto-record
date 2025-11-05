# Sync manifest files - keeps manifest.json, manifest.dev.json, and manifest.prod.json in sync
# Only the client_id field differs between them

$DEV_CLIENT_ID = "24735518815-8lse7s589gt3afro7270gnoq4ep45s0b.apps.googleusercontent.com"
$PROD_CLIENT_ID = "24735518815-d1gqpv71khb43rniq4fb23iuv5bqnsvm.apps.googleusercontent.com"

Write-Host "Syncing manifest files..." -ForegroundColor Cyan

try {
    # Read source manifest.json
    $source = Get-Content "manifest.json" -Raw | ConvertFrom-Json
    
    # Create base manifest
    $baseManifest = $source | ConvertTo-Json -Depth 10 | ConvertFrom-Json
    
    # Sync manifest.dev.json
    $devManifest = $baseManifest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
    $devManifest.oauth2.client_id = $DEV_CLIENT_ID
    $devManifest | ConvertTo-Json -Depth 10 | Set-Content "manifest.dev.json"
    Write-Host "✓ Synced manifest.dev.json" -ForegroundColor Green
    
    # Sync manifest.prod.json
    $prodManifest = $baseManifest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
    $prodManifest.oauth2.client_id = $PROD_CLIENT_ID
    $prodManifest | ConvertTo-Json -Depth 10 | Set-Content "manifest.prod.json"
    Write-Host "✓ Synced manifest.prod.json" -ForegroundColor Green
    
    Write-Host "`n✅ All manifest files synced successfully!" -ForegroundColor Green
    Write-Host "   Source: manifest.json"
    Write-Host "   Dev client ID: $($DEV_CLIENT_ID.Substring(0,30))..."
    Write-Host "   Prod client ID: $($PROD_CLIENT_ID.Substring(0,30))..."
    
} catch {
    Write-Host "❌ Error syncing manifests: $_" -ForegroundColor Red
    exit 1
}

