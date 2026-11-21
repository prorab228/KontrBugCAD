# Супервизор STDIO-пробы: запускает worker, ждёт, при необходимости убивает дерево процессов.
param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string]$AppPath = '',
    [string]$ExtraArgs = '',
    [string]$Tag = 'probe',
    [int]$TimeoutSec = 45,
    [int]$ToolsDelaySec = 10,
    [int]$TailSec = 8,
    [string]$OutDir = 'test-artifacts'
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($OutDir)) { $OutDir = Join-Path $root $OutDir }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $OutDir "stdio-$Tag-$stamp.out.jsonl"
$errFile = Join-Path $OutDir "stdio-$Tag-$stamp.err.log"
$worker = Join-Path $PSScriptRoot 'mcp-stdio-worker.ps1'

$pwshPath = (Get-Process -Id $PID).Path
if (-not $pwshPath) { $pwshPath = (Get-Command pwsh).Source }

$argList = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $worker,
    '-Exe', $Exe,
    '-OutFile', $outFile,
    '-ErrFile', $errFile,
    '-ToolsDelaySec', "$ToolsDelaySec",
    '-TailSec', "$TailSec"
)
if ($AppPath) { $argList += @('-AppPath', $AppPath) }
if ($ExtraArgs) { $argList += @('-ExtraArgs', $ExtraArgs) }

function Quote-Arg([string]$s) {
    if ($s -match '[\s"]') { return '"' + ($s -replace '"', '\"') + '"' }
    return $s
}
$argLine = ($argList | ForEach-Object { Quote-Arg $_ }) -join ' '

$proc = Start-Process -FilePath $pwshPath -ArgumentList $argLine -PassThru -WindowStyle Hidden
$exited = $proc.WaitForExit($TimeoutSec * 1000)
$killed = $false
if (-not $exited) {
    $killed = $true
    taskkill /T /F /PID $proc.Id 2>&1 | Out-Null
    Start-Sleep -Milliseconds 800
}

[pscustomobject]@{
    Tag      = $Tag
    Exited   = $exited
    Killed   = $killed
    OutFile  = $outFile
    ErrFile  = $errFile
    OutLines = (Get-Content $outFile -ErrorAction SilentlyContinue | Measure-Object).Count
} | Format-List

Write-Host '--- stdout ---'
Get-Content $outFile -Encoding utf8 -ErrorAction SilentlyContinue | Select-Object -First 40
Write-Host '--- stderr (tail 25) ---'
Get-Content $errFile -Encoding utf8 -ErrorAction SilentlyContinue | Select-Object -Last 25
