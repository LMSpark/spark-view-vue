# SPARK 示例代码

本目录包含 SPARK 框架的各种使用示例和最佳实践。

## 📚 示例列表

### 应用层基础设施

- **[Logger 提供示例](./LOGGER_PROVIDER_EXAMPLES.md)** - 展示如何在应用层统一提供 Logger
  - 使用 `SparkApp.start()` 提供 logger（推荐）
  - 手动创建 App 实例
  - 在 App.vue 中提供（小型应用）
  - 组件中使用 logger
  - 类型定义和最佳实践

## 🎯 使用说明

每个示例文件都是独立的，可以根据需要单独参考。示例代码经过简化，重点突出核心概念，实际项目中可能需要根据具体情况调整。

## 📖 相关文档

- [快速开始指南](../guides/QUICKSTART.md)
- [组件开发指南](../guides/COMPONENT_DEVELOPMENT.md)
- [能力系统文档](../guides/CAPABILITY_PROVISION.md)
- [API 参考](../guides/API_REFERENCE.md)

## 💡 贡献示例

欢迎贡献新的示例！请确保：

1. ✅ 代码清晰易懂
2. ✅ 包含必要的注释
3. ✅ 提供使用场景说明
4. ✅ 遵循项目代码规范
5. ✅ 使用 Markdown 格式（避免 TypeScript 文件的编译问题）
