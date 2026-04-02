# features 目录说明

`src/features/` 预留给前端应用层的功能分区或扩展模块。当前仓库里它还是空壳目录，用于保留后续按业务域拆分的落点。

## 当前状态

- 目前没有活跃的 feature 子目录。
- 现有前端实现仍主要分布在 `src/components/`、`src/views/`、`src/services/`、`src/layout/`。
- 当某块前端逻辑开始形成稳定业务域时，再考虑从这些目录中抽到 `features/` 下。

## 适合放进这里的内容

- 明确面向某个业务域的页面组合与状态管理
- 围绕某条业务链路组织的前端模块
- 不适合再继续塞进通用 `components/` 或 `services/` 的应用层功能

## 暂不建议放进这里的内容

- 通用基础组件
- 跨域复用服务
- 运行时核心基础设施
- 仅包含单个演示页面的小片段

## 相关文档

- [../../docs/architecture/DATAFLOW_ARCHITECTURE.md](../../docs/architecture/DATAFLOW_ARCHITECTURE.md)
- [../../docs/guides/COMPONENT_DEVELOPMENT.md](../../docs/guides/COMPONENT_DEVELOPMENT.md)
- [../../packages/spark-component/API.md](../../packages/spark-component/API.md)
