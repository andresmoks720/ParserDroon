$path = 'y:\Vasikas\dr1\drooniradar.ee\_app\immutable\nodes\4.CB2fylc3.js'
$content = Get-Content $path -Raw
Write-Host "--- SENSOR KEYWORDS ---"
if ($content -match '.{0,200}sensor.{0,200}') { $matches[0] }
if ($content -match '.{0,200}serialNr.{0,200}') { $matches[0] }
if ($content -match '.{0,200}seen_by.{0,200}') { $matches[0] }
if ($content -match '.{0,200}source.{0,200}') { $matches[0] }
