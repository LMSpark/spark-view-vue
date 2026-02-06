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

### Removed (重大清理 - 2026-02-06)
**第一轮清理（~1000行）：**
- `packages/spark-app/src/events/AppEventBus.ts` - 完全未使用的事件总线系统
- `packages/spark-app/src/logger/README.md` - 子目录重复文档
- `packages/spark-app/src/constants/README.md` - 子目录重复文档  
- `packages/spark-app/src/environment/` - SSR 兼容层（SPA 不需要）
- 从 bootstrap 中移除对 DI 容器的依赖
- 新增 `simpleEnv.ts` 替代复杂的环境检测模块

**第二轮清理（~238行）：**
- `docs/guides/AUTO_IMPORT.md` - 描述未实现的 unplugin 配置
- 标记 DI 容器为 `@deprecated`，推荐使用 Composables API

**第三轮清理（~346行）：**
- `packages/spark-app/src/di/container.ts` - 完全移除依赖注入容器（314行）
- `provideAppContext()` - 未使用的包装函数
- 从 `index.ts` 移除 15+ 个废弃的导出
- 项目全面采用 Vue 3 Composables 模式

**清理成果：**
- 删除代码：~1584 行
- 删除模块：6 个
- 简化 API：移除 15+ 个导出
- 减少认知负担，统一使用 Composables 模式

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
