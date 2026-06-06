# 架构文档

这个目录只放当前仍然成立的架构事实，不再保存历史迁移记录和一次性方案。

## 保留文档

1. [SPARK_PAGE_CONFIG_ARCHITECTURE.md](SPARK_PAGE_CONFIG_ARCHITECTURE.md)：`spark-project-model` 的项目模型、节点模型和配置页内容模型。
2. [DATAFLOW_ARCHITECTURE.md](DATAFLOW_ARCHITECTURE.md)：项目节点、DataSet、DataView、Renderer 的数据流。
3. [PLATFORM_TENANT_ROUTING.md](PLATFORM_TENANT_ROUTING.md)：平台、租户、项目、模块和页面路由边界。
4. [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md)：权限快照、字段权限和动作权限。

## 当前术语

| 术语 | 含义 |
|---|---|
| `ProjectModel` | 软件项目根；持有 `design` 与 `runtime` |
| `ProjectDesign` | 导航与配置页设计内容聚合 |
| `ProjectNode` | 导航节点基 class；按 `nodeKind` 派生子类 |
| `ConfigPageNode` | 配置页节点；聚合四文件与 `PageDesign` / `PageRuntime` |
| `ProjectEditor` | 设计门面：API、session、`subscribe`、落盘 |
| `description` | 节点功能描述，也是用户需求的单一真源 |
| DevSystem | 项目模型消费层，只能通过 `spark-project-model/project` 对接后端 DB / file |

## 治理顺序

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容
```

架构文档先说明理念和边界，再说明结构和调用链。兼容说明只放在真实消费边界，不为旧术语单独保留文档。
