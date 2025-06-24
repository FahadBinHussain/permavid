# PermaVid Codebase Cleanup Script

Write-Host "Starting cleanup of redundant files and folders..." -ForegroundColor Green

# 1. Remove redundant package management files (keeping pnpm-lock.yaml)
if (Test-Path -Path "package-lock.json") {
    Write-Host "Removing package-lock.json (using pnpm-lock.yaml instead)..." -ForegroundColor Yellow
    Remove-Item -Path "package-lock.json" -Force
}

# 2. Clean up build artifacts
Write-Host "Cleaning up build artifacts..." -ForegroundColor Yellow

# Next.js build output
if (Test-Path -Path ".next") {
    Write-Host "Removing .next directory..." -ForegroundColor Yellow
    Remove-Item -Path ".next" -Recurse -Force
}

if (Test-Path -Path "out") {
    Write-Host "Removing out directory..." -ForegroundColor Yellow
    Remove-Item -Path "out" -Recurse -Force
}

# 3. Update .gitignore to include build directories
Write-Host "Updating .gitignore file..." -ForegroundColor Yellow
$gitignoreContent = Get-Content -Path ".gitignore" -Raw
$newEntries = @(
    "# Build output",
    ".next/",
    "out/",
    "electron/dist/",
    "tauri/target/",
    "# Downloaded content",
    "downloads/"
)

$updatedContent = $gitignoreContent
foreach ($entry in $newEntries) {
    if (-not ($gitignoreContent -match [regex]::Escape($entry))) {
        $updatedContent += "`n$entry"
    }
}
Set-Content -Path ".gitignore" -Value $updatedContent

# 4. Choose between Electron and Tauri (keeping Tauri as it's more modern and secure)
Write-Host "Note: Your project contains both Electron and Tauri implementations." -ForegroundColor Yellow
Write-Host "Tauri is generally more modern, secure, and has better performance." -ForegroundColor Yellow
Write-Host "Consider standardizing on one implementation in the future." -ForegroundColor Yellow

# 5. Clean up node_modules (will be reinstalled with pnpm)
if (Test-Path -Path "node_modules") {
    Write-Host "Removing node_modules directory (will be reinstalled with pnpm)..." -ForegroundColor Yellow
    Remove-Item -Path "node_modules" -Recurse -Force
}

if (Test-Path -Path "permavid-index-server/node_modules") {
    Write-Host "Removing permavid-index-server/node_modules directory..." -ForegroundColor Yellow
    Remove-Item -Path "permavid-index-server/node_modules" -Recurse -Force
}

# 6. Reinstall dependencies with pnpm
Write-Host "Reinstalling dependencies with pnpm..." -ForegroundColor Green
pnpm install

# 7. Reinstall server dependencies with pnpm
if (Test-Path -Path "permavid-index-server/package.json") {
    Write-Host "Reinstalling server dependencies with pnpm..." -ForegroundColor Green
    Set-Location -Path "permavid-index-server"
    pnpm install
    Set-Location -Path ".."
}

Write-Host "Cleanup complete!" -ForegroundColor Green
Write-Host "Note: You may want to consider consolidating on either Electron or Tauri for your desktop application." -ForegroundColor Cyan 