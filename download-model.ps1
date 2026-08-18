# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

# download-model.ps1
# Downloads the disease detection model from ICTU-OpenAgri (MIT License)
# Run this script once before starting disease-api service.

$ModelDir = Join-Path $PSScriptRoot "ai-models"
$ModelFile = Join-Path $ModelDir "leaf_disease_model.keras"
$ClassNamesFile = Join-Path $ModelDir "class_names.txt"

$BaseUrl = "https://raw.githubusercontent.com/CuongKenn/ICTU-OpenAgri/main/backend/ml_models"

if (-not (Test-Path $ModelDir)) {
    New-Item -ItemType Directory -Path $ModelDir -Force | Out-Null
}

Write-Host "=== DX-AgriMarket: Disease Detection Model Downloader ===" -ForegroundColor Cyan
Write-Host "Source: CuongKenn/ICTU-OpenAgri (MIT License)" -ForegroundColor Gray
Write-Host ""

# Download model
if (Test-Path $ModelFile) {
    Write-Host "[SKIP] leaf_disease_model.keras already exists ($(((Get-Item $ModelFile).Length / 1MB).ToString('F1')) MB)" -ForegroundColor Yellow
} else {
    Write-Host "[DOWNLOAD] leaf_disease_model.keras (~10 MB)..." -ForegroundColor Green
    try {
        Invoke-WebRequest -Uri "$BaseUrl/leaf_disease_model.keras" -OutFile $ModelFile
        $size = ((Get-Item $ModelFile).Length / 1MB).ToString('F1')
        Write-Host "[OK] Downloaded: $size MB" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Failed to download model: $_" -ForegroundColor Red
        exit 1
    }
}

# Download class names
if (Test-Path $ClassNamesFile) {
    Write-Host "[SKIP] class_names.txt already exists" -ForegroundColor Yellow
} else {
    Write-Host "[DOWNLOAD] class_names.txt..." -ForegroundColor Green
    try {
        Invoke-WebRequest -Uri "$BaseUrl/class_names.txt" -OutFile $ClassNamesFile
        Write-Host "[OK] Downloaded class_names.txt" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Failed to download class names: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=== Done! Model files are ready in ai-models/ ===" -ForegroundColor Cyan
Write-Host "You can now start disease-api with: docker compose up disease-api" -ForegroundColor Gray
