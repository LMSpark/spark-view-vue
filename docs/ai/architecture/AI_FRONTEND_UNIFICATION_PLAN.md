# AI 前端统一方案（Frontend-First Unification）

> 历史归档文档，更新于 2026-04-22。

原文讨论的是 stills 文本协议与旧前端页面生成链的过渡统一方案。该过渡态已经结束：

1. 旧前端页面生成运行时已删除。
2. 页面生成专用端点已删除。
3. 当前仅保留 /api/ai/chat/stream 与 /api/ai/sessions/*。

现行实现请以 packages/spark-ai/ARCHITECTURE.md、spark-ai-server/README.md 与实际代码接线为准。旧方案细节请查阅 git 历史。
