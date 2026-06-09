# AI 文档

## 保留文档

这个目录不再维护手写 AI 体系指南。产品 AI 知识体系的 SSOT 是 VCM metadata 生成链路：

1. [../../packages/spark-ai/ARCHITECTURE.md](../../packages/spark-ai/ARCHITECTURE.md)：spark-ai 端到端架构 SSOT（VCM-native 七工具、Turn、知识双轨）。
2. [spark-ai-workflow.md](spark-ai-workflow.md)：工作流速查 SOP。
3. [../../packages/vite-plugin-spark-catalog/README.md](../../packages/vite-plugin-spark-catalog/README.md)：VCM module metadata 生成器。
4. [../../src/services/page-design/page-design-module-metadata.api.generated.json](../../src/services/page-design/page-design-module-metadata.api.generated.json)：页面设计 API metadata 生成物。
5. [ai-code-generation-behavior.md](ai-code-generation-behavior.md)：Codex / LLM 修改本仓库时必须遵守的代码生成规则。
6. [AI_CODE_GENERATION_BEHAVIOR.en.md](AI_CODE_GENERATION_BEHAVIOR.en.md)：代码生成规则英文版。

## 当前口径

- VCM metadata 由源码注释和 TypeScript 类型生成，不维护手写目录、参数说明或 runtime 路线图。
- 后端 AI 只负责 LLM 通信、APP SSE 通信、会话记录落库和查询。
- 页面设计业务只能通过 `spark-project-model` 的项目模型和 PageNode 子模型沉淀事实。
- 生成代码必须服从：理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容。

## 写作规则

- 默认中文。
- 计划完成即删除；沉淀为规则时进入代码生成规范或 VCM metadata 生成器 README。
- 不再新增独立“方案 v2 / 复审版 / 完成说明”类文档。
