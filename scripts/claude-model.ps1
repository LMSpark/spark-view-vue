param(
  [ValidateSet("show", "backup", "deepseek", "kimi", "aliyun-bailian", "aliyun-coding", "custom", "test")]
  [string]$Action = "show",

  [string]$ApiKey,
  [string]$BaseUrl,
  [string]$Model,
  [string]$OpusModel,
  [string]$SonnetModel,
  [string]$HaikuModel,
  [string]$SubagentModel,
  [string]$EffortLevel = "max",

  [switch]$Persist,
  [switch]$UseUserEnv,
  [switch]$NoRun,

  [string]$ClaudeCommand = "claude",
  [string]$Prompt = "Reply only OK.",
  [double]$MaxBudgetUsd = 0.10,
  [string]$BackupPath
)

$ErrorActionPreference = "Stop"

$ClaudeEnvNames = @(
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "CLAUDE_CODE_EFFORT_LEVEL",
  "ENABLE_TOOL_SEARCH",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN"
)

function Mask-Secret {
  param([string]$Value)
  if ($null -eq $Value -or $Value.Length -eq 0) {
    return "<empty>"
  }
  if ($Value.Length -le 10) {
    return "***"
  }
  return $Value.Substring(0, 4) + "..." + $Value.Substring($Value.Length - 4)
}

function Format-EnvValue {
  param(
    [string]$Name,
    [string]$Value
  )
  if ($Name -match "KEY|TOKEN|SECRET|AUTH|PASSWORD") {
    return Mask-Secret -Value $Value
  }
  return $Value
}

function Get-ClaudeEnv {
  param([string]$Scope)
  $rows = foreach ($name in $ClaudeEnvNames) {
    $value = if ($Scope -eq "Process") {
      [Environment]::GetEnvironmentVariable($name, "Process")
    } else {
      [Environment]::GetEnvironmentVariable($name, "User")
    }
    if ($null -ne $value -and $value.Length -gt 0) {
      [PSCustomObject]@{
        Scope = $Scope
        Name = $name
        Value = Format-EnvValue -Name $name -Value $value
      }
    }
  }
  return $rows
}

function Import-UserClaudeEnv {
  foreach ($name in $ClaudeEnvNames) {
    $value = [Environment]::GetEnvironmentVariable($name, "User")
    if ($null -ne $value -and $value.Length -gt 0) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

function Set-ClaudeEnvValue {
  param(
    [string]$Name,
    [string]$Value,
    [switch]$Persist
  )
  if ($null -eq $Value -or $Value.Length -eq 0) {
    return
  }
  Set-Item -Path "Env:$Name" -Value $Value
  if ($Persist) {
    if (-not (Test-Path -Path "HKCU:\Environment")) {
      New-Item -Path "HKCU:\Environment" | Out-Null
    }
    Set-ItemProperty -Path "HKCU:\Environment" -Name $Name -Value $Value -Type String
  }
}

function Clear-ClaudeEnvValue {
  param(
    [string]$Name,
    [switch]$Persist
  )
  Remove-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
  if ($Persist -and (Test-Path -Path "HKCU:\Environment")) {
    Remove-ItemProperty -Path "HKCU:\Environment" -Name $Name -ErrorAction SilentlyContinue
  }
}

function Resolve-ApiKey {
  param([string[]]$Names)
  if ($ApiKey) {
    return $ApiKey
  }
  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name, "Process")
    if (-not $value) {
      $value = [Environment]::GetEnvironmentVariable($name, "User")
    }
    if ($value) {
      return $value
    }
  }
  return $null
}

function Apply-ClaudeProfile {
  param(
    [string]$ResolvedBaseUrl,
    [string]$ResolvedApiKey,
    [string]$ResolvedModel,
    [string]$ResolvedOpusModel,
    [string]$ResolvedSonnetModel,
    [string]$ResolvedHaikuModel,
    [string]$ResolvedSubagentModel,
    [switch]$Persist
  )

  Set-ClaudeEnvValue -Name "ANTHROPIC_BASE_URL" -Value $ResolvedBaseUrl -Persist:$Persist
  Set-ClaudeEnvValue -Name "ANTHROPIC_AUTH_TOKEN" -Value $ResolvedApiKey -Persist:$Persist
  Clear-ClaudeEnvValue -Name "ANTHROPIC_API_KEY" -Persist:$Persist
  Set-ClaudeEnvValue -Name "ANTHROPIC_MODEL" -Value $ResolvedModel -Persist:$Persist
  Set-ClaudeEnvValue -Name "ANTHROPIC_DEFAULT_OPUS_MODEL" -Value $ResolvedOpusModel -Persist:$Persist
  Set-ClaudeEnvValue -Name "ANTHROPIC_DEFAULT_SONNET_MODEL" -Value $ResolvedSonnetModel -Persist:$Persist
  Set-ClaudeEnvValue -Name "ANTHROPIC_DEFAULT_HAIKU_MODEL" -Value $ResolvedHaikuModel -Persist:$Persist
  Set-ClaudeEnvValue -Name "CLAUDE_CODE_SUBAGENT_MODEL" -Value $ResolvedSubagentModel -Persist:$Persist
  Set-ClaudeEnvValue -Name "CLAUDE_CODE_EFFORT_LEVEL" -Value $EffortLevel -Persist:$Persist

  Write-Output "Claude model profile applied to current process$(if ($Persist) { ' and user environment' } else { '' })."
  Write-Output "ANTHROPIC_BASE_URL=$ResolvedBaseUrl"
  Write-Output "ANTHROPIC_MODEL=$ResolvedModel"
  Write-Output "ANTHROPIC_DEFAULT_OPUS_MODEL=$ResolvedOpusModel"
  Write-Output "ANTHROPIC_DEFAULT_SONNET_MODEL=$ResolvedSonnetModel"
  Write-Output "ANTHROPIC_DEFAULT_HAIKU_MODEL=$ResolvedHaikuModel"
  Write-Output "CLAUDE_CODE_SUBAGENT_MODEL=$ResolvedSubagentModel"
  Write-Output "ANTHROPIC_AUTH_TOKEN=$(Mask-Secret -Value $ResolvedApiKey)"
  Write-Output "ANTHROPIC_API_KEY=<cleared>"
}

function Invoke-ClaudeSmokeTest {
  $modelForTest = $Model
  if (-not $modelForTest) {
    $modelForTest = [Environment]::GetEnvironmentVariable("ANTHROPIC_MODEL", "Process")
  }
  if (-not $modelForTest) {
    $modelForTest = [Environment]::GetEnvironmentVariable("ANTHROPIC_MODEL", "User")
  }
  if (-not $modelForTest) {
    throw "Cannot run test: ANTHROPIC_MODEL is empty."
  }

  Write-Output "Running Claude smoke test with model: $modelForTest"
  & $ClaudeCommand --bare --model $modelForTest -p $Prompt --output-format json --no-session-persistence --max-budget-usd $MaxBudgetUsd
}

if ($Action -eq "show") {
  $processRows = Get-ClaudeEnv -Scope "Process"
  $userRows = Get-ClaudeEnv -Scope "User"
  @($processRows + $userRows) | Format-Table -AutoSize
  return
}

if ($Action -eq "backup") {
  if (-not $BackupPath) {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $BackupPath = Join-Path $desktop ("claude-env-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".reg")
  }
  reg export HKCU\Environment $BackupPath /y | Out-Null
  Write-Output "User environment exported to: $BackupPath"
  return
}

if ($UseUserEnv -or $Action -eq "test") {
  Import-UserClaudeEnv
}

switch ($Action) {
  "deepseek" {
    $resolvedModel = if ($Model) { $Model } else { "deepseek-v4-pro" }
    $resolvedKey = Resolve-ApiKey -Names @("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY")
    if (-not $resolvedKey) {
      throw "Missing API key. Pass -ApiKey or set ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY / DEEPSEEK_API_KEY."
    }
    Apply-ClaudeProfile `
      -ResolvedBaseUrl "https://api.deepseek.com/anthropic" `
      -ResolvedApiKey $resolvedKey `
      -ResolvedModel $resolvedModel `
      -ResolvedOpusModel $(if ($OpusModel) { $OpusModel } else { $resolvedModel }) `
      -ResolvedSonnetModel $(if ($SonnetModel) { $SonnetModel } else { $resolvedModel }) `
      -ResolvedHaikuModel $(if ($HaikuModel) { $HaikuModel } else { $resolvedModel }) `
      -ResolvedSubagentModel $(if ($SubagentModel) { $SubagentModel } else { $resolvedModel }) `
      -Persist:$Persist
  }
  "kimi" {
    $resolvedModel = if ($Model) { $Model } else { "kimi-k2.5" }
    $resolvedKey = Resolve-ApiKey -Names @("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "MOONSHOT_API_KEY", "KIMI_API_KEY")
    if (-not $resolvedKey) {
      throw "Missing API key. Pass -ApiKey or set MOONSHOT_API_KEY / KIMI_API_KEY / ANTHROPIC_AUTH_TOKEN."
    }
    Apply-ClaudeProfile `
      -ResolvedBaseUrl "https://api.moonshot.ai/anthropic" `
      -ResolvedApiKey $resolvedKey `
      -ResolvedModel $resolvedModel `
      -ResolvedOpusModel $(if ($OpusModel) { $OpusModel } else { $resolvedModel }) `
      -ResolvedSonnetModel $(if ($SonnetModel) { $SonnetModel } else { $resolvedModel }) `
      -ResolvedHaikuModel $(if ($HaikuModel) { $HaikuModel } else { $resolvedModel }) `
      -ResolvedSubagentModel $(if ($SubagentModel) { $SubagentModel } else { $resolvedModel }) `
      -Persist:$Persist
    Set-ClaudeEnvValue -Name "ENABLE_TOOL_SEARCH" -Value "false" -Persist:$Persist
  }
  "aliyun-bailian" {
    $resolvedModel = if ($Model) { $Model } else { "qwen3.6-plus" }
    $resolvedKey = Resolve-ApiKey -Names @("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "DASHSCOPE_API_KEY", "ALIYUN_BAILIAN_API_KEY")
    if (-not $resolvedKey) {
      throw "Missing Bailian key. Pass -ApiKey or set DASHSCOPE_API_KEY / ALIYUN_BAILIAN_API_KEY."
    }
    Apply-ClaudeProfile `
      -ResolvedBaseUrl "https://dashscope.aliyuncs.com/apps/anthropic" `
      -ResolvedApiKey $resolvedKey `
      -ResolvedModel $resolvedModel `
      -ResolvedOpusModel $(if ($OpusModel) { $OpusModel } else { $resolvedModel }) `
      -ResolvedSonnetModel $(if ($SonnetModel) { $SonnetModel } else { $resolvedModel }) `
      -ResolvedHaikuModel $(if ($HaikuModel) { $HaikuModel } else { "qwen3.6-flash" }) `
      -ResolvedSubagentModel $(if ($SubagentModel) { $SubagentModel } else { $resolvedModel }) `
      -Persist:$Persist
  }
  "aliyun-coding" {
    $resolvedModel = if ($Model) { $Model } else { "qwen3.6-plus" }
    $resolvedKey = Resolve-ApiKey -Names @("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "DASHSCOPE_API_KEY", "ALIYUN_CODING_PLAN_API_KEY")
    if (-not $resolvedKey) {
      throw "Missing Coding Plan key. Pass -ApiKey with your sk-sp key or set ALIYUN_CODING_PLAN_API_KEY."
    }
    Apply-ClaudeProfile `
      -ResolvedBaseUrl "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic" `
      -ResolvedApiKey $resolvedKey `
      -ResolvedModel $resolvedModel `
      -ResolvedOpusModel $(if ($OpusModel) { $OpusModel } else { $resolvedModel }) `
      -ResolvedSonnetModel $(if ($SonnetModel) { $SonnetModel } else { $resolvedModel }) `
      -ResolvedHaikuModel $(if ($HaikuModel) { $HaikuModel } else { $resolvedModel }) `
      -ResolvedSubagentModel $(if ($SubagentModel) { $SubagentModel } else { $resolvedModel }) `
      -Persist:$Persist
  }
  "custom" {
    if (-not $BaseUrl) {
      throw "Missing -BaseUrl for custom profile."
    }
    if (-not $Model) {
      throw "Missing -Model for custom profile."
    }
    $resolvedKey = Resolve-ApiKey -Names @("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY")
    if (-not $resolvedKey) {
      throw "Missing API key. Pass -ApiKey or set ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY."
    }
    Apply-ClaudeProfile `
      -ResolvedBaseUrl $BaseUrl `
      -ResolvedApiKey $resolvedKey `
      -ResolvedModel $Model `
      -ResolvedOpusModel $(if ($OpusModel) { $OpusModel } else { $Model }) `
      -ResolvedSonnetModel $(if ($SonnetModel) { $SonnetModel } else { $Model }) `
      -ResolvedHaikuModel $(if ($HaikuModel) { $HaikuModel } else { $Model }) `
      -ResolvedSubagentModel $(if ($SubagentModel) { $SubagentModel } else { $Model }) `
      -Persist:$Persist
  }
  "test" {
    Invoke-ClaudeSmokeTest
    return
  }
}

if (-not $NoRun) {
  Write-Output ""
  Write-Output "Tip: run with -NoRun to only set variables. Running a smoke test now."
  Invoke-ClaudeSmokeTest
}
