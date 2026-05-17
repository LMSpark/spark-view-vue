param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\.env.java"),
  [string]$ServerDir = (Join-Path $PSScriptRoot "..\spark-ai-server")
)

$ErrorActionPreference = "Stop"

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return
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
    Set-Item -Path "Env:$name" -Value $value
  }
}

Import-DotEnv -Path $EnvFile

$env:SPRING_PROFILES_ACTIVE = "prod"
$env:MYSQL_JDBC_URL = "jdbc:mysql://127.0.0.1:3307/spark_ai?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
$env:MYSQL_USER = "spark"
$env:MYSQL_PASSWORD = "spark"
$env:PAGES_CONFIG_DIR = (Resolve-Path -LiteralPath (Join-Path $ServerDir "data\pages-config")).Path
$env:PAGES_STORAGE_TYPE = "file"
$env:SPARK_RATE_LIMIT_ENABLED = "false"

$composeFile = Join-Path $ServerDir "docker-compose.yml"
Write-Host "Ensuring Docker MySQL"
Write-Host "  compose: $composeFile"
Write-Host "  mysql:   127.0.0.1:3307/spark_ai"
docker compose -f $composeFile up -d mysql

Write-Host "Starting SPARK AI Server"
Write-Host "  profile: $env:SPRING_PROFILES_ACTIVE"
Write-Host "  mysql:   127.0.0.1:3307/spark_ai"
Write-Host "  ai:      $env:OPENAI_BASE_URL"
Write-Host "  model:   $env:AI_MODEL"

Set-Location -LiteralPath $ServerDir
mvn spring-boot:run
