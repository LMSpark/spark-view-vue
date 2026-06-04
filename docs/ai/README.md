# AI 文档

这个目录只保留 AI 运行时和 AI 生成代码规则。一次性方案、完成记录、页面设计草稿和重复注册指南已删除。

## 保留文档

1. [spark-ai-complete-guide.md](spark-ai-complete-guide.md)：`@spark-appworks/spark-ai` 运行时、模块注册、工具调用、会话和传输契约。
2. [spark-ai-new-system.md](spark-ai-new-system.md)：新 AI 体系总览，串联 VCM 元数据提取、知识分层、function calling 与脚本执行上下文。
3. [ai-code-generation-behavior.md](ai-code-generation-behavior.md)：Codex / LLM 修改本仓库时必须遵守的代码生成规则。

## 当前口径

- `packages/spark-ai` 只负责 AI 协议和运行时内核。
- 业务 AI 在消费层注册模块、输入、生命周期和副作用。
- 页面设计业务只能通过 `spark-project-model` 的项目模型和 PageNode 子模型沉淀事实。
- 生成代码必须服从：理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容。

## 写作规则

- 默认中文。
- 计划完成即删除；沉淀为规则时合并进本目录两篇主文档。
- 不再新增独立“方案 v2 / 复审版 / 完成说明”类文档。
