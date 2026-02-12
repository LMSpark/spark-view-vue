# 临时提交脚本
Set-Location "D:\SPARK_VIEW"

Write-Host "=== 添加文件 ===" -ForegroundColor Cyan
git add -A

Write-Host "`n=== 提交更改 ===" -ForegroundColor Cyan
git commit -m @"
refactor: 统一数据空间接口命名和架构优化

主要变更：
1. 重命名核心接口（统一元数据命名规范）：
   - IBindingContext → IDataView（数据视图，类似 .NET DataView）
   - IBindingContextData → IViewMetadata（视图元数据）
   - IDataTableData → ITableMetadata（表元数据）
   - IDataSetData → IDataSetMetadata（数据集元数据）

2. 重命名核心类：
   - BindingContext → DataView（7个文件更新）
   - 更新所有方法：setBindingContext → setDataView

3. 类型系统优化：
   - 迁移 ApiResponse 从 spark-data 到 spark-utils（与网络请求放一起）
   - 更新所有相关引用和导出

4. 架构改进：
   - 清晰的元数据层（IViewMetadata, ITableMetadata, IDataSetMetadata）
   - 明确的运行时层（IDataView, IDataTable, IDataSet）
   - 更好的命名对齐（与 .NET DataView 概念一致）

影响范围：
- packages/spark-data/src/: 类型定义、核心类、命名空间
- packages/spark-utils/src/: Request.ts, index.ts
- tests/: 测试文件更新

✅ 所有编译检查通过
✅ 所有 lint 检查通过
✅ 所有测试通过
"@

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== 推送到远程 ===" -ForegroundColor Cyan
    git push
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ 提交并推送成功!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ 推送失败!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n❌ 提交失败或没有更改!" -ForegroundColor Yellow
}
