# 架构文档索引

这个目录面向维护者，记录当前运行时的结构设计、核心约束和重要重构结论。

## 当前建议先看

1. [DATAFLOW_ARCHITECTURE.md](DATAFLOW_ARCHITECTURE.md)：页面配置、DataSet、渲染链路的总体数据流。
2. [PERMISSION_SYSTEM.md](PERMISSION_SYSTEM.md)：权限模型、快照与渲染规则。
3. [PLATFORM_TENANT_ROUTING.md](PLATFORM_TENANT_ROUTING.md)：租户/项目路由与平台级路径结构。
4. [SPARK_AI_PACKAGE_FULL_DESIGN.md](SPARK_AI_PACKAGE_FULL_DESIGN.md)：`packages/spark-ai` 完整设计方案（含与后端接口关联、风险和分阶段落地计划）。

## 编写边界

- 这里记录“系统为什么这样设计”，不是“新手怎么使用”。
- 若文档依赖旧实现前提，必须在文件顶部明确归档说明。
- 与 AI 提示词直接相关的规则不要放这里，统一放到 [docs/ai/README.md](../ai/README.md) 所指向的目录体系中。
