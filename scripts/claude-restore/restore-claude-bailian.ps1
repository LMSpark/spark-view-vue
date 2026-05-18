[CmdletBinding()]
param(
  [switch]$FilesOnly,
  [switch]$EnvOnly,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$SnapshotDir = Join-Path $ScriptDir "snapshot"

$BailianBaseUrl = "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic"
$BailianModel = "qwen3.6-plus"

function Write-Step {
  param([string]$Message)
  Write-Host "[restore] $Message"
}

function Copy-SnapshotFile {
  param([string]$RelativePath)

  $source = Join-Path $SnapshotDir $RelativePath
  $target = Join-Path $RepoRoot $RelativePath

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing snapshot file: $source"
  }

  $targetDir = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  }

  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Step "Restored $RelativePath"
}

function Read-JsonOrEmptyObject {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{}
  }

  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return [pscustomobject]@{}
  }

  return $raw | ConvertFrom-Json -ErrorAction Stop
}

function Set-JsonProperty {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name,
    $Value
  )

  if ($Object.PSObject.Properties.Name -contains $Name) {
    $Object.$Name = $Value
    return
  }

  $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
}

function Remove-JsonProperty {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if ($Object.PSObject.Properties.Name -contains $Name) {
    $Object.PSObject.Properties.Remove($Name)
  }
}

function Ensure-JsonObjectProperty {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if ($Object.PSObject.Properties.Name -notcontains $Name -or $null -eq $Object.$Name) {
    Set-JsonProperty -Object $Object -Name $Name -Value ([pscustomobject]@{})
  }

  return $Object.$Name
}

function Save-Json {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $dir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }

  $Object | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Restore-ClaudeEnvironment {
  $token = [Environment]::GetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN", "User")
  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [Environment]::GetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN", "Process")
  }

  if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Warning "ANTHROPIC_AUTH_TOKEN was not found. Skipped key restore. Set your Bailian Token Plan key in the user environment first."
    return
  }

  if (-not (Test-Path -Path "HKCU:\Environment")) {
    New-Item -Path "HKCU:\Environment" | Out-Null
  }

  Set-ItemProperty -Path "HKCU:\Environment" -Name "ANTHROPIC_AUTH_TOKEN" -Value $token -Type String
  Set-ItemProperty -Path "HKCU:\Environment" -Name "ANTHROPIC_BASE_URL" -Value $BailianBaseUrl -Type String
  Set-ItemProperty -Path "HKCU:\Environment" -Name "ANTHROPIC_MODEL" -Value $BailianModel -Type String
  Set-ItemProperty -Path "HKCU:\Environment" -Name "ANTHROPIC_DEFAULT_HAIKU_MODEL" -Value $BailianModel -Type String
  Set-ItemProperty -Path "HKCU:\Environment" -Name "ANTHROPIC_DEFAULT_SONNET_MODEL" -Value $BailianModel -Type String
  Set-ItemProperty -Path "HKCU:\Environment" -Name "ANTHROPIC_DEFAULT_OPUS_MODEL" -Value $BailianModel -Type String
  Set-ItemProperty -Path "HKCU:\Environment" -Name "CLAUDE_CODE_SUBAGENT_MODEL" -Value $BailianModel -Type String
  Remove-ItemProperty -Path "HKCU:\Environment" -Name "ANTHROPIC_API_KEY" -ErrorAction SilentlyContinue

  $env:ANTHROPIC_AUTH_TOKEN = $token
  $env:ANTHROPIC_BASE_URL = $BailianBaseUrl
  $env:ANTHROPIC_MODEL = $BailianModel
  $env:ANTHROPIC_DEFAULT_HAIKU_MODEL = $BailianModel
  $env:ANTHROPIC_DEFAULT_SONNET_MODEL = $BailianModel
  $env:ANTHROPIC_DEFAULT_OPUS_MODEL = $BailianModel
  $env:CLAUDE_CODE_SUBAGENT_MODEL = $BailianModel
  Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue

  $settingsPath = Join-Path $HOME ".claude\settings.json"
  $settings = Read-JsonOrEmptyObject -Path $settingsPath
  $settingsEnv = Ensure-JsonObjectProperty -Object $settings -Name "env"

  Remove-JsonProperty -Object $settingsEnv -Name "ANTHROPIC_API_KEY"
  Set-JsonProperty -Object $settingsEnv -Name "ANTHROPIC_AUTH_TOKEN" -Value $token
  Set-JsonProperty -Object $settingsEnv -Name "ANTHROPIC_BASE_URL" -Value $BailianBaseUrl
  Set-JsonProperty -Object $settingsEnv -Name "ANTHROPIC_MODEL" -Value $BailianModel
  Set-JsonProperty -Object $settingsEnv -Name "ANTHROPIC_DEFAULT_HAIKU_MODEL" -Value $BailianModel
  Set-JsonProperty -Object $settingsEnv -Name "ANTHROPIC_DEFAULT_SONNET_MODEL" -Value $BailianModel
  Set-JsonProperty -Object $settingsEnv -Name "ANTHROPIC_DEFAULT_OPUS_MODEL" -Value $BailianModel
  Set-JsonProperty -Object $settingsEnv -Name "CLAUDE_CODE_SUBAGENT_MODEL" -Value $BailianModel
  Save-Json -Object $settings -Path $settingsPath

  $rootConfigPath = Join-Path $HOME ".claude.json"
  $rootConfig = Read-JsonOrEmptyObject -Path $rootConfigPath
  Set-JsonProperty -Object $rootConfig -Name "hasCompletedOnboarding" -Value $true
  Save-Json -Object $rootConfig -Path $rootConfigPath

  Write-Step "Restored Claude Code Bailian Token Plan environment and settings.json"
  Write-Step "ANTHROPIC_AUTH_TOKEN=<set, hidden>"
  Write-Step "ANTHROPIC_API_KEY=<cleared>"
  Write-Step "ANTHROPIC_BASE_URL=$BailianBaseUrl"
}

Write-Step "Repo root: $RepoRoot"

if (-not $EnvOnly) {
  Copy-SnapshotFile -RelativePath "CLAUDE.md"
  Copy-SnapshotFile -RelativePath "scripts\claude-model.ps1"
  Copy-SnapshotFile -RelativePath "scripts\setup-claude-deepseek.ps1"
}

if (-not $FilesOnly) {
  Restore-ClaudeEnvironment
}

Write-Step "Done. Reopen your terminal, then run: claude -p `"OK`""
