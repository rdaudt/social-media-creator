param(
  [int]$Port = 3500,
  [switch]$CleanBuild
)

$ErrorActionPreference = "Stop"

$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutLog = Join-Path $ProjectPath (".vercel-dev." + $stamp + ".out.log")
$ErrLog = Join-Path $ProjectPath (".vercel-dev." + $stamp + ".err.log")

Write-Host "Project: $ProjectPath"
Write-Host "Port: $Port"
$cleanBuildLabel = if ($CleanBuild.IsPresent) { "true" } else { "false" }
Write-Host ("CleanBuild: " + $cleanBuildLabel)

function Stop-ProcessTree([int]$ProcessId) {
  & taskkill /PID $ProcessId /T /F *> $null
}

function Get-NodeDevProcesses() {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    (
      ($_.CommandLine -like "*$ProjectPath*" -and ($_.CommandLine -like "*next dev*" -or $_.CommandLine -like "*vercel*dev*")) -or
      ($_.CommandLine -like "*node_modules\\vercel\\dist\\vc.js*" -and $_.CommandLine -like "*dev --listen*")
    )
  }
}

function Get-PortListeners([int]$TargetPort) {
  netstat -ano | Select-String (":" + $TargetPort + "\s+.*LISTENING\s+(\d+)$") | ForEach-Object {
    $m = [regex]::Match($_.ToString(), "LISTENING\s+(\d+)$")
    if ($m.Success) { [int]$m.Groups[1].Value }
  } | Select-Object -Unique
}

function Try-RemoveNext([string]$Path) {
  if (-not (Test-Path $Path)) {
    Write-Host ".next not found"
    return
  }
  $attempts = 5
  for ($i = 1; $i -le $attempts; $i++) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force
      Write-Host "Removed .next"
      return
    } catch {
      if ($i -lt $attempts) {
        Start-Sleep -Seconds 1
      } else {
        Write-Warning "Could not remove .next after $attempts attempt(s). Continuing without clean build."
      }
    }
  }
}

function Ensure-PortBound([int]$TargetPort, [string]$OutPath, [string]$ErrPath) {
  $waitMaxSeconds = 30
  for ($i = 0; $i -lt $waitMaxSeconds; $i++) {
    $listeners = Get-PortListeners -TargetPort $TargetPort
    if ($listeners -and $listeners.Count -gt 0) {
      $procId = [int]$listeners[0]
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
      if (-not $proc) {
        Start-Sleep -Milliseconds 500
        continue
      }
      $isProjectOwned = $proc -and $proc.Name -eq "node.exe"
      if ($isProjectOwned) {
        Write-Host "Vercel dev is listening on port $TargetPort (PID $procId)."
        return $true
      }
      Write-Warning "Port $TargetPort is occupied by PID $procId, forcing restart."
      Stop-ProcessTree -ProcessId $procId
      return $false
    }
    Start-Sleep -Seconds 1
  }

  Write-Warning "Could not confirm desired listener on port $TargetPort."
  Write-Host "stdout log: $OutPath"
  Write-Host "stderr log: $ErrPath"
  return $false
}

$allToStop = @(Get-NodeDevProcesses | Sort-Object ProcessId -Unique)
if ($allToStop.Count -gt 0) {
  $allToStop | ForEach-Object { Stop-ProcessTree -ProcessId $_.ProcessId }
  Write-Host ("Stopped process(es): " + $allToStop.Count)
} else {
  Write-Host "Stopped process(es): 0"
}

$listeners = @(Get-PortListeners -TargetPort $Port)
foreach ($procId in $listeners) {
  Stop-ProcessTree -ProcessId $procId
  Write-Host "Stopped process on target port $Port (PID $procId)."
}

$nextPath = Join-Path $ProjectPath ".next"
if ($CleanBuild.IsPresent) {
  Try-RemoveNext -Path $nextPath
}

$maxStartAttempts = 3
$bound = $false
for ($attempt = 1; $attempt -le $maxStartAttempts -and -not $bound; $attempt++) {
  $null = Start-Process -FilePath "vercel.cmd" -ArgumentList @("dev", "--listen", "$Port") -WorkingDirectory $ProjectPath -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru
  $bound = Ensure-PortBound -TargetPort $Port -OutPath $OutLog -ErrPath $ErrLog
  if (-not $bound -and $attempt -lt $maxStartAttempts) {
    Write-Warning "Retrying vercel dev start on port $Port (attempt $($attempt + 1)/$maxStartAttempts)."
    Start-Sleep -Seconds 1
  }
}

Write-Host "stdout log: $OutLog"
Write-Host "stderr log: $ErrLog"
