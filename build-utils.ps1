# 构建 spark-utils 包
Write-Host "清理 dist 目录..." -ForegroundColor Yellow
Remove-Item "d:\SPARK_VIEW\packages\spark-utils\dist" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "编译 TypeScript..." -ForegroundColor Yellow
Set-Location "d:\SPARK_VIEW\packages\spark-utils"
& npx tsc -p tsconfig.build.json

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 构建成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "检查 executeEndpoint 是否存在..." -ForegroundColor Cyan
    $content = Get-Content "dist\Request.d.ts" -Raw
    if ($content -match "executeEndpoint") {
        Write-Host "✅ executeEndpoint 方法已添加到类型定义！" -ForegroundColor Green
    } else {
        Write-Host "❌ executeEndpoint 方法未找到" -ForegroundColor Red
    }
} else {
    Write-Host "❌ 构建失败" -ForegroundColor Red
    exit 1
}
