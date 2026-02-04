# Changelog

## [Unreleased]

### Added
- 支持普通元素（div、span 等）的 `dataKey` 文本内容绑定
- 支持 el-table 的简单数据绑定（无需 DataSet）
- 新增能力管理演示页面 `/capability-demo`
- 集成异步数据加载演示页面 `/async-demo`

### Fixed
- 修复 `dataKey` 数据绑定功能：
  - 普通元素的 `dataKey` 现在可以正确显示数据
  - el-table 不再强制要求 DataSet 存在
  - 支持从 pageData 直接绑定数据
- 修复 Settings.vue 中 Element Plus API 使用问题：
  - el-radio 使用 `value` 替代废弃的 `label`
  - el-checkbox 使用 `value` 替代废弃的 `label`
  - el-timeline-item 移除不支持的 `size="small"` 属性

### Changed
- 简化 main.ts 为 100% 声明式配置
- 移除 apps 目录，统一为单一入口
- 移除调试日志，保持代码整洁

### Documentation
- 更新 `ASYNC_DATA_LOADING.md` 文档，添加 dataKey 绑定详细说明
- 更新 `ASYNC_DATA_QUICK_REF.md` 快速参考，补充文本绑定示例

## [0.1.0] - 2026-02-04

### Added
- 初始版本发布
- SPARK 组件系统核心功能
- 混合渲染系统（Vue 组件 + 配置页面）
- DataSet 数据管理
- 页面配置加载器
- 异步数据加载支持
