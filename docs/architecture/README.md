# 架构文档索引

这个目录面向维护者，记录当前系统结构和边界。历史方案不在这里延续；若必须留档，应在文件顶部明确标记为归档。

## 先看这三篇

1. [SPARK_PAGE_CONFIG_ARCHITECTURE.md](SPARK_PAGE_CONFIG_ARCHITECTURE.md)：`ProjectModel`、`PageNode`、项目节点树和项目策划。
2. [DATAFLOW_ARCHITECTURE.md](DATAFLOW_ARCHITECTURE.md)：项目模型到渲染运行时的数据流。
3. [PLATFORM_TENANT_ROUTING.md](PLATFORM_TENANT_ROUTING.md)：平台、租户、项目、模块树和路由作用域。

## 其他专题

- [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md)：权限模型、快照与渲染规则。
- [VERSION_MANAGEMENT.md](VERSION_MANAGEMENT.md)：DevSystem 版本管理。
- [CAPABILITY_SYSTEM_MIGRATION.md](CAPABILITY_SYSTEM_MIGRATION.md)：能力系统迁移记录。

## 治理顺序

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容
```

架构文档先解释系统为什么存在，再解释如何分层。兼容说明只能放在边界位置。

## 当前术语

| 术语 | 含义 |
|---|---|
| `ProjectModel` | 软件项目模型，一个项目由模块树和多个页面节点模型组成 |
| 项目节点树 | 项目内模块、页面、子页面的树；后端 API 仍叫 navigation |
| `ProjectPlanningModel` | 项目策划、模块策划、页面策划模型 |
| `PageNode` | 单页面节点模型，包含 navigation/rule/dataSet/script/style |
| `description` | 节点功能描述和用户需求的单一真源 |
| DevSystem | 项目模型消费层，不是模型层 |

## 编写边界

- 架构文档不写新手操作手册。
- AI runtime 规则统一放到 [../ai/spark-ai-complete-guide.md](../ai/spark-ai-complete-guide.md)。
- `spark-page-config` 必须保持纯模型包，文档不能引导它依赖 UI 或 App service。
