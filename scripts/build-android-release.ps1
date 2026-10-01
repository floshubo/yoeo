param([switch]$AllowTestConfiguration)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$signingFile = Join-Path $projectRoot '.env.android-signing'
$productionFile = Join-Path $projectRoot '.env.production'

function Import-SimpleEnv([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $name = $Matches[1]
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
      }
    }
  }
}

Import-SimpleEnv $signingFile
Import-SimpleEnv $productionFile

$required = @(
  'YOEO_KEYSTORE_PATH',
  'YOEO_KEY_ALIAS',
  'YOEO_KEYSTORE_PASSWORD',
  'YOEO_KEY_PASSWORD'
)

$missing = @($required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) })
if ($missing.Count -gt 0) {
  throw "Set the Android signing variables or create .env.android-signing: $($missing -join ', ')"
}

if (-not $AllowTestConfiguration) {
  if ([string]::IsNullOrWhiteSpace($env:VITE_REVENUECAT_ANDROID_API_KEY)) {
    throw 'Set VITE_REVENUECAT_ANDROID_API_KEY in .env.production before creating a Play Store bundle.'
  }
  if ([string]::IsNullOrWhiteSpace($env:VITE_API_BASE_URL) -or $env:VITE_API_BASE_URL -match 'localhost|127\.0\.0\.1') {
    throw 'Set VITE_API_BASE_URL in .env.production to the deployed HTTPS API before creating a Play Store bundle.'
  }
}

$androidStudioJava = 'C:\Program Files\Android\Android Studio\jbr'
if ([string]::IsNullOrWhiteSpace($env:JAVA_HOME) -and (Test-Path -LiteralPath $androidStudioJava)) {
  $env:JAVA_HOME = $androidStudioJava
}

if ([string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
  throw 'Set JAVA_HOME to a Java 21 installation. Android Studio includes one in its jbr directory.'
}

Push-Location $projectRoot
try {
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw 'Web production build failed.' }
  pnpm exec cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'Android Capacitor synchronization failed.' }
} finally {
  Pop-Location
}

Push-Location (Join-Path $PSScriptRoot '..\android')
try {
  .\gradlew.bat bundleRelease
  if ($LASTEXITCODE -ne 0) { throw 'Android release bundle failed.' }
} finally {
  Pop-Location
}

Write-Output 'Signed Android bundle: android/app/build/outputs/bundle/release/app-release.aab'
