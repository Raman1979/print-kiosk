# Creates a "Start Print Agent" shortcut with a custom printer icon on
# the Desktop, and a matching one in the Windows Startup folder so the
# agent launches automatically whenever the shop PC turns on.

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $scriptDir "start-agent.bat"
$icon = Join-Path $scriptDir "icon.ico"

if (-not (Test-Path $target)) {
    Write-Host "ERROR: start-agent.bat not found next to this script." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}
if (-not (Test-Path $icon)) {
    Write-Host "ERROR: icon.ico not found next to this script." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$WshShell = New-Object -ComObject WScript.Shell

function New-AgentShortcut($path) {
    $shortcut = $WshShell.CreateShortcut($path)
    $shortcut.TargetPath = $target
    $shortcut.WorkingDirectory = $scriptDir
    $shortcut.IconLocation = $icon
    $shortcut.WindowStyle = 1
    $shortcut.Description = "Starts the print kiosk agent"
    $shortcut.Save()
}

$desktop = [Environment]::GetFolderPath("Desktop")
New-AgentShortcut (Join-Path $desktop "Start Print Agent.lnk")
Write-Host "Created Desktop shortcut: Start Print Agent" -ForegroundColor Green

$startup = [Environment]::GetFolderPath("Startup")
New-AgentShortcut (Join-Path $startup "Start Print Agent.lnk")
Write-Host "Created Startup shortcut - the agent will now launch automatically when this PC turns on." -ForegroundColor Green

Write-Host ""
Write-Host "All done! You can now double-click 'Start Print Agent' on the Desktop." -ForegroundColor Cyan
Read-Host "Press Enter to close"
