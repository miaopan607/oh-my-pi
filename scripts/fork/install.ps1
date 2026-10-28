param(
    [switch] $Update,
    [switch] $EnableAutoUpdate
)
# Install only the fork's independent "omp-mp" command, never official "omp".
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repo = "miaopan607/oh-my-pi"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\omp-mp"
$ConfigDir = Join-Path $env:USERPROFILE ".omp-mp"
$BinaryPath = Join-Path $InstallDir "omp.exe"
$ConfigPath = Join-Path $ConfigDir "config.yml"
$InstallerPath = Join-Path $InstallDir "install.ps1"
$InstallerUrl = "https://raw.githubusercontent.com/$Repo/main/scripts/fork/install.ps1"
$ApiUrl = "https://api.github.com/repos/$Repo/releases/latest"

if (-not [Environment]::Is64BitOperatingSystem -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() -ne "X64") {
    throw "Only Windows x64 is supported by the current fork release."
}
New-Item -ItemType Directory -Force -Path $InstallDir, $ConfigDir | Out-Null

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    [System.IO.File]::WriteAllText($ConfigPath, "{}" + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Created fork-only overrides: $ConfigPath"
}

# A local copy lets the launcher work without pipe-to-PowerShell for updates.
$InstallerTemp = "$InstallerPath.download"
try {
    Invoke-WebRequest -UseBasicParsing -Uri $InstallerUrl -OutFile $InstallerTemp
    Move-Item -Force -LiteralPath $InstallerTemp -Destination $InstallerPath
} catch {
    Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $InstallerTemp
    if (-not (Test-Path -LiteralPath $InstallerPath)) {
        Write-Warning "The updater script could not be cached: $_"
    }
}

$release = Invoke-RestMethod -Uri $ApiUrl -Headers @{ Accept = "application/vnd.github+json"; "User-Agent" = "omp-mp-installer" }
$tag = [string] $release.tag_name
if ($tag -notmatch '^fork-v[a-zA-Z0-9._-]+$') {
    throw "Invalid fork release tag: $tag"
}
$VersionFile = Join-Path $InstallDir "release-tag"
$HashFile = Join-Path $InstallDir "installed-sha256"
$upToDate = $false
if ((Test-Path -LiteralPath $BinaryPath) -and (Test-Path -LiteralPath $VersionFile) -and (Test-Path -LiteralPath $HashFile)) {
    $installedTag = (Get-Content -LiteralPath $VersionFile -Raw).Trim()
    $installedHash = (Get-Content -LiteralPath $HashFile -Raw).Trim()
    if ($installedTag -eq $tag -and $installedHash -eq (Get-FileHash -LiteralPath $BinaryPath -Algorithm SHA256).Hash) {
        $upToDate = $true
    }
}

if ($upToDate) {
    Write-Host "omp-mp already up to date: $tag"
} else {
    $checksums = @($release.assets | Where-Object { $_.name -eq "SHA256SUMS.txt" } | Select-Object -First 1)
    $asset = @($release.assets | Where-Object { $_.name -eq "omp-windows-x64.exe" } | Select-Object -First 1)
    if ($checksums.Count -ne 1 -or $asset.Count -ne 1) { throw "Latest Release is missing its Windows binary or SHA256SUMS.txt" }

    $tmp = Join-Path $env:TEMP ("omp-mp-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $checksumPath = Join-Path $tmp "SHA256SUMS.txt"
        $downloadedBinary = Join-Path $tmp "omp.exe"
        Invoke-WebRequest -UseBasicParsing -Uri $checksums[0].browser_download_url -OutFile $checksumPath
        $checksumLine = Get-Content -LiteralPath $checksumPath |
            Where-Object { $_ -match '^[a-fA-F0-9]{64}\s+\*?omp-windows-x64\.exe\s*$' } |
            Select-Object -First 1
        if (-not $checksumLine) { throw "Release SHA256SUMS does not contain omp-windows-x64.exe" }
        $expectedHash = ([regex]::Match($checksumLine, '^[a-fA-F0-9]{64}')).Value.ToUpperInvariant()
        Write-Host "Downloading Windows x64 omp-mp ($tag)..."
        Invoke-WebRequest -UseBasicParsing -Uri $asset[0].browser_download_url -OutFile $downloadedBinary
        $actualHash = (Get-FileHash -LiteralPath $downloadedBinary -Algorithm SHA256).Hash
        if ($actualHash -ne $expectedHash) { throw "SHA-256 mismatch; old installation was not modified" }
        & $downloadedBinary --version | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Downloaded executable failed the version smoke test" }
        try {
            Move-Item -Force -LiteralPath $downloadedBinary -Destination $BinaryPath
        } catch {
            throw "Cannot replace the executable; close running omp-mp sessions and retry. $_"
        }
        [System.IO.File]::WriteAllText($VersionFile, $tag + [Environment]::NewLine)
        [System.IO.File]::WriteAllText($HashFile, $expectedHash + [Environment]::NewLine)
        Write-Host "Installed $tag"
    } finally {
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -LiteralPath $tmp
    }
}

$launcher = @'
@echo off
setlocal
set "FORK_CONFIG=%USERPROFILE%\.omp-mp\config.yml"
if /I "%~1"=="--fork-update" goto UPDATE
if /I "%~1"=="--fork-auto-update" goto AUTOUPDATE
if /I "%~1"=="--fork-config" goto CONFIG
if not exist "%FORK_CONFIG%" (
    if not exist "%USERPROFILE%\.omp-mp" mkdir "%USERPROFILE%\.omp-mp"
    echo {}>"%FORK_CONFIG%"
)
rem Fork-owned writable settings; keep upstream agent profile/auth/sessions.
rem Do not change official config or unrelated PI_CONFIG_FILES overlays.
set "OMP_MP_CONFIG_FILE=%FORK_CONFIG%"
"%~dp0omp.exe" %*
exit /b %errorlevel%
:UPDATE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Update
exit /b %errorlevel%
:AUTOUPDATE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -EnableAutoUpdate
exit /b %errorlevel%
:CONFIG
echo %FORK_CONFIG%
exit /b 0
'@
$LauncherPath = Join-Path $InstallDir "omp-mp.cmd"
[System.IO.File]::WriteAllText($LauncherPath, $launcher, (New-Object System.Text.UTF8Encoding($false)))

# Add to the current user PATH, not the system-wide or official omp location.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$entries = @($userPath -split ";" | Where-Object { $_ -ne "" })
if ($entries -notcontains $InstallDir) {
    $newPath = ($entries + $InstallDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}
if (@($env:PATH -split ";") -notcontains $InstallDir) {
    $env:PATH = "$env:PATH;$InstallDir"
}
if ($EnableAutoUpdate) {
    $trigger = New-ScheduledTaskTrigger -Daily -At "03:17"
    $actionArgs = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $InstallerPath + '" -Update'
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
    Register-ScheduledTask -TaskName "omp-mp Daily Update" -Description "Check the user's fork releases daily" -Trigger $trigger -Action $action -Force | Out-Null
    Write-Host "Enabled daily automatic updates (Task Scheduler, 03:17)."
}
Write-Host "Fork command: omp-mp  (open a new terminal if PATH has not refreshed)"
Write-Host "Fork config: $ConfigPath"
Write-Host "Manual update: omp-mp --fork-update"
Write-Host "Enable daily updates: omp-mp --fork-auto-update"
