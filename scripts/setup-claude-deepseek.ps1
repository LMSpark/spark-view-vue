param(
  [string]$EnvFile = (Join-Path (Split-Path $PSScriptRoot -Parent) ".env.java"),
  [string]$Model,
  [switch]$ProcessOnly
)

$ErrorActionPreference = "Stop"

function Read-DotEnvFile {
  param([string]$Path)
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }
    $idx = $trimmed.IndexOf("=")
    if ($idx -le 0) {
      continue
    }
    $name = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$name] = $value
  }
  return $values
}

function Set-ClaudeEnv {
  param(
    [string]$Name,
    [string]$Value,
    [switch]$ProcessOnly
  )
  if ($null -eq $Value -or $Value.Trim().Length -eq 0) {
    return
  }
  Set-Item -Path "Env:$Name" -Value $Value
  if (-not $ProcessOnly) {
    if (-not (Test-Path -Path "HKCU:\Environment")) {
      New-Item -Path "HKCU:\Environment" | Out-Null
    }
    Set-ItemProperty -Path "HKCU:\Environment" -Name $Name -Value $Value -Type String
  }
}

function Mask-Secret {
  param([string]$Value)
  if ($null -eq $Value -or $Value.Length -eq 0) {
    return "<empty>"
  }
  if ($Value.Length -le 10) {
    return "***"
  }
  return $Value.Substring(0, 6) + "..." + $Value.Substring($Value.Length - 4)
}

$envValues = Read-DotEnvFile -Path $EnvFile
$apiKey = $envValues["ANTHROPIC_AUTH_TOKEN"]
if (-not $apiKey) { $apiKey = $envValues["ANTHROPIC_API_KEY"] }
if (-not $apiKey) { $apiKey = $envValues["DEEPSEEK_API_KEY"] }
if (-not $apiKey) { $apiKey = $envValues["OPENAI_API_KEY"] }
if (-not $apiKey) { $apiKey = $env:ANTHROPIC_AUTH_TOKEN }
if (-not $apiKey) { $apiKey = $env:ANTHROPIC_API_KEY }
if (-not $apiKey) { $apiKey = $env:DEEPSEEK_API_KEY }
if (-not $apiKey) { $apiKey = $env:OPENAI_API_KEY }

if (-not $apiKey) {
  throw "Missing DeepSeek API key. Set OPENAI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_AUTH_TOKEN, or ANTHROPIC_API_KEY in $EnvFile."
}

$resolvedModel = $Model
if (-not $resolvedModel) { $resolvedModel = $envValues["ANTHROPIC_MODEL"] }
if (-not $resolvedModel) { $resolvedModel = $envValues["AI_MODEL"] }
if (-not $resolvedModel) { $resolvedModel = $env:ANTHROPIC_MODEL }
if (-not $resolvedModel) { $resolvedModel = $env:AI_MODEL }
if (-not $resolvedModel) { $resolvedModel = "deepseek-chat" }

$baseUrl = "https://api.deepseek.com/anthropic"

Set-ClaudeEnv -Name "ANTHROPIC_BASE_URL" -Value $baseUrl -ProcessOnly:$ProcessOnly
Set-ClaudeEnv -Name "ANTHROPIC_AUTH_TOKEN" -Value $apiKey -ProcessOnly:$ProcessOnly
Set-ClaudeEnv -Name "ANTHROPIC_API_KEY" -Value $apiKey -ProcessOnly:$ProcessOnly
Set-ClaudeEnv -Name "ANTHROPIC_MODEL" -Value $resolvedModel -ProcessOnly:$ProcessOnly
Set-ClaudeEnv -Name "ANTHROPIC_DEFAULT_OPUS_MODEL" -Value $resolvedModel -ProcessOnly:$ProcessOnly
Set-ClaudeEnv -Name "ANTHROPIC_DEFAULT_SONNET_MODEL" -Value $resolvedModel -ProcessOnly:$ProcessOnly
Set-ClaudeEnv -Name "ANTHROPIC_DEFAULT_HAIKU_MODEL" -Value $resolvedModel -ProcessOnly:$ProcessOnly
Set-ClaudeEnv -Name "CLAUDE_CODE_SUBAGENT_MODEL" -Value $resolvedModel -ProcessOnly:$ProcessOnly
Set-ClaudeEnv -Name "CLAUDE_CODE_EFFORT_LEVEL" -Value "max" -ProcessOnly:$ProcessOnly

$scope = if ($ProcessOnly) { "current process" } else { "current process + user environment" }
Write-Output "Claude Code DeepSeek configuration applied to $scope."
Write-Output "ANTHROPIC_BASE_URL=$baseUrl"
Write-Output "ANTHROPIC_MODEL=$resolvedModel"
Write-Output "ANTHROPIC_AUTH_TOKEN=$(Mask-Secret $apiKey)"
