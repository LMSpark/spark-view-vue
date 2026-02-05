# SPARK View 文档中心

> 完整的开发指南、API 参考和最佳实践

##  文档导航

### 快速入门

- [**快速开始**](guides/QUICKSTART.md) - 5分钟上手 SPARK
- [业务开发快速入门](guides/BUSINESS_DEVELOPER_QUICKSTART.md) - 面向业务开发者
- [组件开发指南](guides/COMPONENT_DEVELOPMENT.md) - 创建自定义组件
- [AUTO IMPORT](guides/AUTO_IMPORT.md) - 自动导入配置

### 核心概念

#### 能力系统

- [**能力系统指南**](guides/CAPABILITY_PROVISION.md) - 完整的能力系统说明
- [APP 服务能力](guides/APP_SERVICES_CAPABILITY.md) - 应用级服务注入
- [能力系统工具包](guides/UTILS_CAPABILITY_SYSTEM.md) - spark-utils 能力系统

#### 数据管理

- [**数据管理指南**](guides/DATA_MANAGEMENT.md) - DataSet 和 TreeManager
- [异步数据加载](guides/ASYNC_DATA_LOADING.md) - 完整指南
- [异步数据快速参考](guides/ASYNC_DATA_QUICK_REF.md) - 快速查阅

#### 动态加载

- [**动态导入完整指南**](guides/DYNAMIC_IMPORT.md) - 组件懒加载
- [动态导入快速参考](guides/DYNAMIC_IMPORT_QUICK_REF.md) - 快速查阅
- [Smart Load Demo](guides/SMART_LOAD_DEMO.md) - 智能加载演示

### API 参考

- [**API 参考手册**](guides/API_REFERENCE.md) - 完整 API 文档
- [API 简化指南](guides/API_SIMPLIFICATION.md) - API 设计原则
- [Easy Register API](guides/EASY_REGISTER_API.md) - 简化注册 API

### 高级主题

#### 业务脚本

- [**业务脚本指南**](guides/BUSINESS_SCRIPTS.md) - 在配置中编写逻辑
- [沙箱页面脚本](guides/SANDBOX_PAGE_SCRIPTS.md) - 页面级脚本

#### 表单系统

- [FormCreate 高级用法](guides/FORMCREATE_ADVANCED.md)
- [FormCreate API](guides/FORMCREATE_API.md)
- [FormCreate 快速API](guides/FORMCREATE_API_QUICK.md)
- [FormCreate 路线图](guides/FORMCREATE_ROADMAP.md)
- [FormCreate README](guides/README_FORMCREATE.md)

#### 日志系统

- [Logger 迁移指南](guides/LOGGER_MIGRATION.md) - 日志系统升级

#### SSR

- [SSR 快速入门](guides/QUICKSTART_SSR.md) - 服务端渲染

### 组合式 API

- [**Composables 使用指南**](guides/USE_COMPOSABLES.md) - Vue 3 组合式 API
- [SPARK APP 迁移](guides/SPARKAPP_MIGRATION.md) - 从旧版本迁移

##  架构文档

### 设计与规划

- [能力系统简化方案](CAPABILITY_SIMPLIFICATION.md)
- [能力重构计划](capability-refactor-plan.md)
- [DataSet 设计分析](DATASET_DESIGN_ANALYSIS.md)
- [DataSet 重构计划](DATASET_REFACTORING_PLAN.md)
- [DataSet API 集成计划](DATASET_API_INTEGRATION_PLAN.md)
- [类型安全改进](TYPE_SAFETY_IMPROVEMENTS.md)

##  包文档

每个包都有独立的 README 和 API 文档：

- [spark-app](../packages/spark-app/README.md) - 应用基础设施
- [spark-component](../packages/spark-component/README.md) - 组件核心
- [spark-data](../packages/spark-data/README.md) - 数据管理
- [spark-page-config](../packages/spark-page-config/README.md) - 页面配置
- [spark-renderer](../packages/spark-renderer/README.md) - 页面渲染
- [spark-utils](../packages/spark-utils/README.md) - 工具函数
- [spark-unified](../packages/spark-unified/README.md) - 统一导出

##  按场景查找

### 我想...

- **创建一个新组件**  [组件开发指南](guides/COMPONENT_DEVELOPMENT.md)
- **使用数据集**  [数据管理指南](guides/DATA_MANAGEMENT.md)
- **组件间通信**  [能力系统指南](guides/CAPABILITY_PROVISION.md)
- **优化加载性能**  [动态导入指南](guides/DYNAMIC_IMPORT.md)  
- **编写业务逻辑**  [业务脚本指南](guides/BUSINESS_SCRIPTS.md)
- **查看 API**  [API 参考手册](guides/API_REFERENCE.md)
- **从旧版本迁移**  [SPARK APP 迁移](guides/SPARKAPP_MIGRATION.md)

##  获取帮助

-  先查看相关文档
-  报告问题：[GitHub Issues](https://github.com/your-org/spark-view/issues)
-  讨论：[GitHub Discussions](https://github.com/your-org/spark-view/discussions)

##  文档贡献

发现文档问题或想要改进？欢迎提交 PR！

- 文档使用 Markdown 格式
- 代码示例需要完整可运行
- 保持简洁清晰的写作风格

---

**最后更新**: 2026-02-05  
**文档版本**: 2.0