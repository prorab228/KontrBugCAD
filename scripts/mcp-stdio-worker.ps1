# Worker: говорит по MCP STDIO с указанным процессом и складывает ответы в файлы.
# Запускается супервизором (mcp-stdio-probe.ps1), т.к. сам может висеть после EOF.
param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string]$AppPath = '',
    [string]$ExtraArgs = '',
    [Parameter(Mandatory = $true)][string]$OutFile,
    [Parameter(Mandatory = $true)][string]$ErrFile,
    [int]$ToolsDelaySec = 10,
    [int]$TailSec = 8
)

$ErrorActionPreference = 'Continue'

$argv = @()
if ($AppPath) { $argv += $AppPath }
if ($ExtraArgs) { $argv += ($ExtraArgs -split '\s+' | Where-Object { $_ }) }

$init = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"dsh-stdio-probe","version":"1.0.0"}}}'
$inited = '{"jsonrpc":"2.0","method":"notifications/initialized"}'
$list = '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

"# launched: $Exe $($argv -join ' ')" | Set-Content -Path $ErrFile -Encoding utf8
Set-Content -Path $OutFile -Value '' -Encoding utf8

& {
    $init
    $inited
    Start-Sleep -Seconds $ToolsDelaySec
    $list
    Start-Sleep -Seconds $TailSec
} | & $Exe @argv 2>> $ErrFile > $OutFile
