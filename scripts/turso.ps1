param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$Distro = if ($env:TURSO_WSL_DISTRO) { $env:TURSO_WSL_DISTRO } else { "" }

if ($Distro) {
  wsl.exe -d $Distro -e sh -lc "turso $($Args -join ' ')"
} else {
  wsl.exe -e sh -lc "turso $($Args -join ' ')"
}