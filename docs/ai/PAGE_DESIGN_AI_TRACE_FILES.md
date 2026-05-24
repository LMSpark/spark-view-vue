# PageDesign AI Trace Source Files

> 记录时间：2026-05-24
>
> 目的：把 `PAGE_DESIGN_AI_TRACE[...]` 的 28 个源码标识逐条落成 Markdown 台账，方便后续清理前端重构冗余时按源码位置回看职责边界。
>
> 总索引见：`docs/ai/PAGE_DESIGN_AI_TRACE_INDEX.md`

## 校验口径

当前台账按源码中的 trace 标识计数：

- 源码标识：28 个
- 文档索引：28 个
- 唯一源码文件：15 个

推荐复核命令：

```bash
rg -n "PAGE_DESIGN_AI_TRACE\[[^\]]+\]" scripts packages/spark-ai/src packages/spark-page-config/src packages/spark-utils/src
```

## 28 个源码标识台账

| # | Trace ID | 源码文件 | 当前行 | 流程位置 | 职责边界 |
| --- | --- | --- | ---: | --- | --- |
| 1 | `live-llm-entry` | `scripts/verify-page-design-leave-llm-live.mjs` | 13 | live smoke 入口 | 真实“请假申请页面设计”AI 线评测入口，只装配登录、注册、会话和验收。 |
| 2 | `live-auth` | `scripts/verify-page-design-leave-llm-live.mjs` | 276 | live smoke 鉴权 | 登录或接收外部 token，后续 AI/page-config 请求复用同一组鉴权头。 |
| 3 | `live-page-workspace` | `scripts/verify-page-design-leave-llm-live.mjs` | 334 | live page-config 工作区 | 把真实 pages-config API 包装成 `PageConfigEditWorkspace`，pageDesign 工具只改前端 workspace。 |
| 4 | `live-session-reset` | `scripts/verify-page-design-leave-llm-live.mjs` | 491 | live 会话隔离 | 预建隔离 V4 session，避免旧后端会话历史污染评测。 |
| 5 | `live-artifact-assertions` | `scripts/verify-page-design-leave-llm-live.mjs` | 812 | live 成果验收 | 集中验证 `rule.json` / `pagedata.json` 结构语义，不做 LLM 文本快照。 |
| 6 | `live-orchestrator` | `scripts/verify-page-design-leave-llm-live.mjs` | 884 | live 主流程 | 编排登录、页面替换、注册 pageDesign、启动 AI、保存脏文件和远端回读。 |
| 7 | `host-session-entry` | `packages/spark-ai/src/host/business/business-session.ts` | 214 | AI Host 会话入口 | `createAiHostBusinessSession/start/send` 的前端 Agent 会话入口。 |
| 8 | `host-session-start` | `packages/spark-ai/src/host/business/business-session.ts` | 294 | AI Host 会话启动 | 调用业务 `onStartSession`，创建 sessionStore 记录，并投影 module-semantic 工具。 |
| 9 | `host-tool-loop` | `packages/spark-ai/src/host/tool-loop/tool-loop-runner.ts` | 79 | 工具循环 | LLM round、toolCalls、工具结果回填和生命周期指令闭环。 |
| 10 | `host-transport-prepare-session` | `packages/spark-ai/src/host/transport/fetch-transport.ts` | 85 | V4 session prepare | SSE turn 前显式创建/准备后端 session，不与模型 stream 请求混合。 |
| 11 | `host-transport-stream` | `packages/spark-ai/src/host/transport/fetch-transport.ts` | 128 | V4 SSE stream | Java AI 后端 `/api/ai/sessions/*` SSE 调用入口，只传输模型回复和工具调用。 |
| 12 | `host-transport-append` | `packages/spark-ai/src/host/transport/fetch-transport.ts` | 164 | V4 appendMessages | 工具调用完成后的 AI 会话历史同步入口。 |
| 13 | `host-append-envelope` | `packages/spark-ai/src/host/transport/fetch-response-envelope.ts` | 77 | V4 HTTP envelope | `appendMessages` 响应解包和身份校验，只代表会话历史同步成功。 |
| 14 | `host-sse-reader` | `packages/spark-ai/src/host/transport/sse-stream-reader.ts` | 71 | SSE frame reader | 聚合 delta/result/toolCalls，不承载 pageDesign 业务工具语义。 |
| 15 | `host-sse-v4-envelope` | `packages/spark-ai/src/host/transport/sse-stream-reader.ts` | 329 | V4 SSE envelope | 校验 transport/event/session/turn/stream，不解释业务载荷。 |
| 16 | `host-sse-tool-call-payload` | `packages/spark-ai/src/host/transport/sse-stream-reader.ts` | 456 | toolCalls 提取 | 从 V4 result、legacy payload、OpenAI choices 提取 toolCalls，真正执行在 tool-loop。 |
| 17 | `page-design-registration` | `packages/spark-page-config/src/ai/page-design-module.ts` | 92 | pageDesign AI 注册 | pageDesign business registration 真源，注册 lifecycle/text-model/payload-catalog/node-tree/dataset。 |
| 18 | `page-design-lifecycle` | `packages/spark-page-config/src/ai/lifecycle-tool-catalog.ts` | 32 | lifecycle 工具目录 | bootstrap/progress/流程知识出处，只读编辑态和流程事实。 |
| 19 | `page-design-dataset-tool` | `packages/spark-page-config/src/ai/dataset-tool-catalog.ts` | 1880 | dataset 工具目录 | pageDesign AI 修改 `pagedata.json` 的 ModuleKind 出处。 |
| 20 | `page-design-node-tree-tool` | `packages/spark-page-config/src/ai/node-tree-tool-catalog.ts` | 591 | node-tree 工具目录 | pageDesign AI 修改 `rule.json` 的 ModuleKind 出处，集中做 type/id/payload props 校验。 |
| 21 | `page-design-payload-provider` | `packages/spark-page-config/src/ai/payload-catalog-tool-catalog.ts` | 203 | payload-catalog 工具目录 | 组件参数荷载指南出处，`guidePayload/paramsSchema` 真源。 |
| 22 | `page-design-text-model` | `packages/spark-page-config/src/ai/text-model-tool-catalog.ts` | 38 | text-model 工具目录 | pageDesign AI 写 `script.js` / `style.css` 的工具目录。 |
| 23 | `page-design-live-service` | `packages/spark-page-config/src/design/page-design-service.ts` | 318 | live edit bridge | 把 ModuleKind action 落到 `PageDesignEditHost`，不保存 AI 会话历史。 |
| 24 | `page-design-payload-guide-state` | `packages/spark-page-config/src/design/page-design-service.ts` | 379 | payload guide 状态 | 记录当前 pageDesign 会话已显式获取的组件 payload guide。 |
| 25 | `page-design-payload-props-validator` | `packages/spark-page-config/src/design/page-design-service.ts` | 410 | props schema 校验 | node-tree 写入前校验 props，参数错时返回给 LLM 修正。 |
| 26 | `page-design-workspace-load` | `packages/spark-page-config/src/design/page-edit-workspace.ts` | 143 | 四文件加载 | live edit host 加载 `rule.json/pagedata.json/script.js/style.css` 的 workspace 入口。 |
| 27 | `page-design-workspace-save` | `packages/spark-page-config/src/design/page-edit-workspace.ts` | 221 | 四文件保存 | AI 工具修改四文件后保存到 pages-config 的入口。 |
| 28 | `file-loader-v4-envelope` | `packages/spark-utils/src/http/FileLoader.ts` | 614 | pages-config 文件读取 | pages-config 文件读取的 V4 HTTP envelope 解包点。 |

## 唯一源码文件汇总

| 源码文件 | Trace 数 | Trace ID |
| --- | ---: | --- |
| `scripts/verify-page-design-leave-llm-live.mjs` | 6 | `live-llm-entry`, `live-auth`, `live-page-workspace`, `live-session-reset`, `live-artifact-assertions`, `live-orchestrator` |
| `packages/spark-ai/src/host/business/business-session.ts` | 2 | `host-session-entry`, `host-session-start` |
| `packages/spark-ai/src/host/tool-loop/tool-loop-runner.ts` | 1 | `host-tool-loop` |
| `packages/spark-ai/src/host/transport/fetch-transport.ts` | 3 | `host-transport-prepare-session`, `host-transport-stream`, `host-transport-append` |
| `packages/spark-ai/src/host/transport/fetch-response-envelope.ts` | 1 | `host-append-envelope` |
| `packages/spark-ai/src/host/transport/sse-stream-reader.ts` | 3 | `host-sse-reader`, `host-sse-v4-envelope`, `host-sse-tool-call-payload` |
| `packages/spark-page-config/src/ai/page-design-module.ts` | 1 | `page-design-registration` |
| `packages/spark-page-config/src/ai/lifecycle-tool-catalog.ts` | 1 | `page-design-lifecycle` |
| `packages/spark-page-config/src/ai/dataset-tool-catalog.ts` | 1 | `page-design-dataset-tool` |
| `packages/spark-page-config/src/ai/node-tree-tool-catalog.ts` | 1 | `page-design-node-tree-tool` |
| `packages/spark-page-config/src/ai/payload-catalog-tool-catalog.ts` | 1 | `page-design-payload-provider` |
| `packages/spark-page-config/src/ai/text-model-tool-catalog.ts` | 1 | `page-design-text-model` |
| `packages/spark-page-config/src/design/page-design-service.ts` | 3 | `page-design-live-service`, `page-design-payload-guide-state`, `page-design-payload-props-validator` |
| `packages/spark-page-config/src/design/page-edit-workspace.ts` | 2 | `page-design-workspace-load`, `page-design-workspace-save` |
| `packages/spark-utils/src/http/FileLoader.ts` | 1 | `file-loader-v4-envelope` |

## 边界提醒

- `scripts/verify-page-design-leave-llm-live.mjs` 只做 live smoke 装配和验收，不承载 pageDesign 业务生成逻辑。
- `packages/spark-ai/src/host/**` 只负责会话、V4 传输、SSE 解析和 tool-loop，不识别具体 pageDesign 函数语义。
- `packages/spark-page-config/src/ai/**` 是 pageDesign 业务协议装配层，负责把 lifecycle/dataset/node-tree/payload/text-model 暴露给 LLM。
- `packages/spark-page-config/src/design/**` 是 live edit bridge 和 workspace，不等同于 AI 后端会话历史。
- `packages/spark-utils/src/http/FileLoader.ts` 只处理 pages-config 文件读取的 V4 envelope，不代表页面四文件保存完成。
