param(
    [string]$ProjectPath = ".",
    [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-CapturedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FileName,
        [string[]]$Arguments = @()
    )

    $command = Get-Command $FileName -ErrorAction SilentlyContinue
    if (-not $command) {
        return [ordered]@{
            available = $false
            exitCode = $null
            output = @()
        }
    }

    $output = & $FileName @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) {
        $exitCode = 0
    }

    return [ordered]@{
        available = $true
        exitCode = $exitCode
        output = @($output | ForEach-Object { $_.ToString() })
    }
}

$resolvedRoot = Resolve-Path -LiteralPath $ProjectPath
$pubspecPath = Join-Path $resolvedRoot.Path "pubspec.yaml"
$pubspecMatches = @()

if (Test-Path -LiteralPath $pubspecPath) {
    $pubspecMatches = @($pubspecPath)
} else {
    $pubspecMatches = @(
        Get-ChildItem -LiteralPath $resolvedRoot.Path -Filter "pubspec.yaml" -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 10 -ExpandProperty FullName
    )
}

$doctor = $null
if (-not $SkipDoctor) {
    $doctor = Invoke-CapturedCommand -FileName "flutter" -Arguments @("doctor", "-v")
}

$result = [ordered]@{
    root = $resolvedRoot.Path
    pubspecFiles = $pubspecMatches
    hasFlutterProject = ($pubspecMatches.Count -gt 0)
    flutterVersion = Invoke-CapturedCommand -FileName "flutter" -Arguments @("--version")
    dartVersion = Invoke-CapturedCommand -FileName "dart" -Arguments @("--version")
    flutterDevices = Invoke-CapturedCommand -FileName "flutter" -Arguments @("devices")
    flutterDoctor = $doctor
}

$result | ConvertTo-Json -Depth 8
