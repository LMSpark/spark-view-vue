# Git 提交和推送脚本
# 第10-11轮优化：简化API，统一组件系统创建

Write-Host "🚀 准备提交代码..." -ForegroundColor Cyan

# 切换到项目目录
Set-Location d:\SPARK_VIEW

# 查看当前变更
Write-Host "`n📝 当前变更文件：" -ForegroundColor Yellow
git status --short

# 添加所有文件
Write-Host "`n➕ 添加所有变更..." -ForegroundColor Green
git add .

# 创建提交
$commitMessage = @"
refactor: 简化Vue插件API，隐藏Manager实现细节

第10轮优化 - 统一组件系统创建：
• 新增 createComponentSystem() 统一工厂方法  
• 确保 manager 和 registry 始终正确配对
• 更新所有测试文件使用新的创建模式
• 修复 column-manager-location 测试中的属性访问错误

第11轮优化 - 简化Vue插件API：
• VueSparkPluginOptions 移除 manager 参数
• Manager 由框架自动创建和管理
• 简化 API：app.use(Spark.createVuePlugin())
• 业务开发者只需关心 Registry（注册组件定义）
• 更新所有相关文档和测试用例

优化效果：
✨ 减少业务开发心智负担
✨ 防止 manager/registry 错误配对
✨ API 更加简洁直观
✨ 累计删除 ~800+ 行代码

Modified files:
- packages/spark-component/src/plugins/VueSparkPlugin.ts
- packages/spark-component/src/spark-namespace.ts
- packages/spark-component/src/utils/SparkComponentManager.ts
- packages/spark-component/src/index.ts
- packages/spark-component/tests/vue-plugin.test.ts
- packages/spark-component/README.md
- packages/spark-component/API.md
- docs/guides/API_REFERENCE.md
- .github/copilot-instructions.md
- tests/*.test.ts (7 files)
- verify-api-change.mjs (new)
"@

Write-Host "`n💾 创建提交..." -ForegroundColor Green
git commit -m $commitMessage

# 查看提交信息
Write-Host "`n✅ 提交完成！" -ForegroundColor Green
git log --oneline -1

# 推送到远程
Write-Host "`n📤 推送到远程仓库..." -ForegroundColor Cyan
$branch = git branch --show-current
Write-Host "当前分支: $branch" -ForegroundColor Yellow

git push origin $branch

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 推送成功！" -ForegroundColor Green
} else {
    Write-Host "`n❌ 推送失败，请检查网络连接或权限" -ForegroundColor Red
    exit 1
}

Write-Host "`n📊 提交统计：" -ForegroundColor Cyan
git diff HEAD~1 --stat

Write-Host "`n✨ 完成！" -ForegroundColor Green
