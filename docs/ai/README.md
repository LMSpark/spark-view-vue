# AI 文档

## 分层边界

本目录属于 AI 编码赋能层：约束 AI 编码助手如何研读、提问、计划、实施、验证和沉淀知识。

- 产品层 AI 架构、Agent Workflow、ClassModel 运行时等事实以 `packages/spark-ai/docs/`、源码、模型 class 和 JSDoc 为准
- 本目录可以引用产品层事实作为编码约束，但不替代产品层文档或源码真源
- `notes/` 只保存当前任务所需的研读锚点、方案和度量；计划执行完成并验证后应删除对应 `plan-*`

## 保留文档

这个目录不再维护手写 AI 体系指南。产品 AI 知识体系的 SSOT 是 DTS ClassModel 生成链路：

1. [../../packages/spark-ai/ARCHITECTURE.md](../../packages/spark-ai/ARCHITECTURE.md)：spark-ai 端到端架构 SSOT（ClassModel 七工具、Turn、DTS 知识）。
2. [spark-ai-workflow.md](spark-ai-workflow.md)：工作流速查 SOP。
3. [AI_MODEL_SPEC.md](AI_MODEL_SPEC.md)：模型 class 规范。
4. [../../ai-coding-kit/AGENTS.md](../../ai-coding-kit/AGENTS.md)：AI 编码标准主体（7 阶段代码修改协议、代码生成行为规范、跨会话委派协议 EPSS）。
5. [../../knowledge/](../../knowledge/)：知识库——AI 编码过程中积累的隐含规则和踩坑记录。

## 当前口径

- DTS ClassModel 由源码 + JSDoc 经**内存 emit** 投影为 JSON bundle（`generated/dts-class-model/`），不维护手写目录、参数说明或 runtime 路线图；运行时由 Web Worker 按需加载 shard。
- 后端 AI 只负责 LLM 通信、APP SSE 通信、会话记录落库和查询。
- 页面设计业务只能通过 `spark-project-model` 的项目模型和 PageNode 子模型沉淀事实。
- 生成代码必须服从：理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 迁移便利。

## 写作规则

- 默认中文。
- 计划完成即删除；沉淀为规则时进入代码生成规范或 DTS ClassModel 生成说明。
- 不再新增独立“方案 v2 / 复审版 / 完成说明”类文档。
