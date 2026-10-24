$WshShell = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$desktop\OpenCode Manager.lnk")
$Shortcut.TargetPath = "$desktop\OpenCode Manager.bat"
$Shortcut.WorkingDirectory = "$env:USERPROFILE\.config\opencode\opencode-manager"
$Shortcut.WindowStyle = 7
$Shortcut.IconLocation = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe,0"
$Shortcut.Description = "OpenCode Multi-Node Manager"
$Shortcut.Save()
Write-Host "Shortcut updated: $desktop\OpenCode Manager.lnk"
