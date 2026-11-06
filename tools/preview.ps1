param([switch]$NoOpen, [switch]$Settings, [switch]$Restore, [switch]$RestoreDenied, [switch]$BrokenUninstall, [switch]$Contributors)
$ErrorActionPreference = 'Stop'
if ($Settings -and ($Restore -or $RestoreDenied)) { throw 'Choose either -Settings or -Restore.' }
if ($BrokenUninstall -and ($Settings -or $Restore -or $RestoreDenied)) { throw 'Choose one preview scenario.' }
$repo = Split-Path $PSScriptRoot -Parent
$ui = Join-Path $repo 'usb/ui'
$manifests = @{}
Get-ChildItem (Join-Path $repo 'usb/tweaks') -Directory | ForEach-Object {
    $manifest = Join-Path $_.FullName 'manifest.conf'
    if (Test-Path -LiteralPath $manifest) {
        $manifests[$_.Name] = [System.IO.File]::ReadAllText($manifest)
    }
}
$exampleManifest = Join-Path $repo 'development/examples/settings/manifest.conf'
$manifests['settings-example'] = [System.IO.File]::ReadAllText($exampleManifest)
if ($Contributors) {
    $manifests['settings-example'] += "`ncontributors=Original author: Example Author; installer integration: Another Developer`n"
    $Settings = $true
}
# Embed the real UI and manifests in a disposable, offline browser preview.
$json = ConvertTo-Json -InputObject $manifests -Compress
$json = $json.Replace('<', '\u003c')
$html = [System.IO.File]::ReadAllText((Join-Path $ui 'index-template.html'))
$css = [System.IO.File]::ReadAllText((Join-Path $ui 'style.css'))
$languages = [System.IO.File]::ReadAllText((Join-Path $ui 'language-names.js'))
$app = [System.IO.File]::ReadAllText((Join-Path $ui 'app.js'))
$mock = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'preview-bridge.js'))
$settingsScript = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'preview-navigation.js'))
$brokenUninstallDemo = if ($BrokenUninstall) { 'true' } else { 'false' }
$settingsDemo = if ($Settings) { 'true' } else { 'false' }
$recoveryDeniedDemo = if ($RestoreDenied) { 'true' } else { 'false' }
$recoveryDemo = if ($Restore -or $RestoreDenied) { 'true' } else { 'false' }
$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>$css</style>")
$installerVersion = [System.IO.File]::ReadAllText((Join-Path $repo 'usb/VERSION')).Trim()
if ($installerVersion -notmatch '^[0-9]+[.][0-9]+[.][0-9]+$') { throw 'Invalid installer VERSION.' }
$html = $html.Replace('@INSTALLER_VERSION@', $installerVersion)
$html = $html.Replace('@ORIGIN@', 'preview').Replace('@TOKEN@', 'preview')
$html = $html.Replace('<script src="language-names.js"></script>', "<script>$languages</script>")
$html = $html.Replace('<script src="app.js"></script>', "<script>window.previewManifests=$json;window.previewSettingsDemo=$settingsDemo;window.previewBrokenUninstallDemo=$brokenUninstallDemo;window.previewRecoveryDemo=$recoveryDemo;window.previewRecoveryDeniedDemo=$recoveryDeniedDemo;</script><script>$settingsScript</script><script>$mock</script><script>$app</script>")
$html = $html.Replace('<title>MZD Tweaks</title>', '<title>MZD Tweaks - OFFLINE PREVIEW</title>')
$previewPath = Join-Path ([System.IO.Path]::GetTempPath()) 'cmu-tweaks-preview.html'
[System.IO.File]::WriteAllText($previewPath, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Output $previewPath
if (-not $NoOpen) { Start-Process -FilePath $previewPath }
