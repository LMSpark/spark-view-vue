# SPARK AI 改造执行清单

> 历史归档文档，更新于 2026-04-22。

原清单针对旧页面生成链的 fail-fast 收敛与接线计划，而该链路已删除。当前仓库的有效验证与实施基线如下：

1. AI 聊天：/api/ai/chat/stream。
2. 统一会话：/api/ai/sessions/*。
3. 前端编辑主线：runStillsLoop()、SessionBackendImpl、DevDataSetDesigner、useRuleEditSession。
4. 常用验证：pnpm run typecheck、pnpm run lint、pnpm run test、cd spark-ai-server && mvn test。

如需旧清单，请查看 git 历史；本文不再保留过期执行项，避免继续引用已删除的 ai-loop 接口。
