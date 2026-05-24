param(
  [int]$Port = 3500
)

$ErrorActionPreference = "Stop"

$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutLog = Join-Path $ProjectPath (".vercel-dev." + $stamp + ".out.log")
$ErrLog = Join-Path $ProjectPath (".vercel-dev." + $stamp + ".err.log")

Write-Host "Project: $ProjectPath"
Write-Host "Port: $Port"

$matching = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and
  $_.CommandLine -like "*$ProjectPath*" -and
  ( $_.CommandLine -like "*next dev*" -or $_.CommandLine -like "*vercel*dev*" )
}

$vercelMatching = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and
  $_.CommandLine -like "*node_modules\\vercel\\dist\\vc.js*" -and
  $_.CommandLine -like "* dev *" -and
  $_.CommandLine -like ("*--listen " + $Port + "*")
}

$allToStop = @($matching + $vercelMatching | Sort-Object ProcessId -Unique)

if ($allToStop) {
  $allToStop | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Write-Host ("Stopped process(es): " + ($allToStop | Measure-Object | Select-Object -ExpandProperty Count))
} else {
  Write-Host "Stopped process(es): 0"
}

$portPid = (netstat -ano | Select-String (":" + $Port + "\s+.*LISTENING\s+(\d+)$") | ForEach-Object {
  $m = [regex]::Match($_.ToString(), "LISTENING\s+(\d+)$")
  if ($m.Success) { [int]$m.Groups[1].Value }
} | Select-Object -Unique | Select-Object -First 1)

if ($portPid) {
  $portProc = Get-CimInstance Win32_Process -Filter "ProcessId = $portPid" -ErrorAction SilentlyContinue
  if ($portProc -and $portProc.Name -eq "node.exe" -and $portProc.CommandLine -like "*$ProjectPath*") {
    Stop-Process -Id $portPid -Force
    Write-Host "Stopped process on target port $Port (PID $portPid)."
  } else {
    Write-Warning "Port $Port is in use by PID $portPid not owned by this project. It will not be terminated."
  }
}

$nextPath = Join-Path $ProjectPath ".next"
if (Test-Path $nextPath) {
  Remove-Item -LiteralPath $nextPath -Recurse -Force
  Write-Host "Removed .next"
} else {
  Write-Host ".next not found"
}

$proc = Start-Process -FilePath "vercel.cmd" -ArgumentList @("dev", "--listen", "$Port") -WorkingDirectory $ProjectPath -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru
Start-Sleep -Seconds 5

$listening = netstat -ano | Select-String (":" + $Port + "\s+.*LISTENING\s+" + $proc.Id + "$")
if ($listening) {
  Write-Host "Vercel dev is listening on port $Port (PID $($proc.Id))."
} else {
  Write-Warning "Could not confirm listener for PID $($proc.Id) on port $Port yet. Check logs:"
  Write-Host $OutLog
  Write-Host $ErrLog
}

Write-Host "stdout log: $OutLog"
Write-Host "stderr log: $ErrLog"
