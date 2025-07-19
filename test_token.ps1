# PowerShell script to test Facebook token
$token = "EAAUZA8UIhozIBPAeavmnGSdnfVsKgsLb1p6pE36XDZC9ZC3ZApn1N7SewGeeAnHdY2bmmhZBiIMoq33GExrucTJQdM0TRRrBIuhBGS1am1ZAMjvRAHtUFpljDdGB1dBccCJQTiANprZBu2TXXIjDiZAisRZBOPjcah5yw9Ng1glB9GOYdj57otSL4ehVOmvBF3HTGXmWZCFu3L4d5sDqKCmDY3t9pWHpCmtfo2gZAgk37EZD"

Write-Host "Testing Facebook Token..." -ForegroundColor Green

# Test 1: Check token info
Write-Host "`nChecking token info..." -ForegroundColor Yellow
$debugUrl = "https://graph.facebook.com/debug_token?input_token=$token&access_token=$token"
try {
    $response = Invoke-RestMethod -Uri $debugUrl -Method Get
    Write-Host "Token Type: $($response.data.type)" -ForegroundColor Green
    Write-Host "App ID: $($response.data.app_id)" -ForegroundColor Green
    Write-Host "User ID: $($response.data.user_id)" -ForegroundColor Green
    if ($response.data.expires_at) {
        $expiryDate = [DateTimeOffset]::FromUnixTimeSeconds($response.data.expires_at).DateTime
        Write-Host "Expires At: $expiryDate" -ForegroundColor Green
    } else {
        Write-Host "Expires At: Never" -ForegroundColor Green
    }
} catch {
    Write-Host "Token debug failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Check user info
Write-Host "`nChecking user info..." -ForegroundColor Yellow
$userUrl = "https://graph.facebook.com/v17.0/me?access_token=$token"
try {
    $response = Invoke-RestMethod -Uri $userUrl -Method Get
    Write-Host "User ID: $($response.id)" -ForegroundColor Green
    Write-Host "User Name: $($response.name)" -ForegroundColor Green
    Write-Host "User Type: $($response.category)" -ForegroundColor Green
} catch {
    Write-Host "User info failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Check permissions
Write-Host "`nChecking permissions..." -ForegroundColor Yellow
$permsUrl = "https://graph.facebook.com/v17.0/me/permissions?access_token=$token"
try {
    $response = Invoke-RestMethod -Uri $permsUrl -Method Get
    Write-Host "Permissions:" -ForegroundColor Green
    foreach ($perm in $response.data) {
        Write-Host "   $($perm.permission): $($perm.status)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "Permissions check failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nToken test completed!" -ForegroundColor Green 