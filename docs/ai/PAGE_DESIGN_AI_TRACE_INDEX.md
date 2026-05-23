# PageDesign AI Trace Index

> 记录时间：2026-05-24
>
> 目的：给“页面设计 AI 一条线”做源码出处索引，方便后续清理重构冗余时快速定位真实入口、职责边界和不应混淆的相邻代码。
>
> 完整工程流程见：`docs/ai/PAGE_DESIGN_AI_ENGINEERING_FLOW.md`

## 快速定位

```bash
rg "PAGE_DESIGN_AI_TRACE" scripts packages/spark-ai/src packages/spark-page-config/src packages/spark-utils/src
```

标识格式统一为：

```text
PAGE_DESIGN_AI_TRACE[trace-id]
```

## 范围

本索引只覆盖 AI 线：

- live LLM 评测入口
- AI Host business session
- AI Host tool loop
- Java AI 后端 SSE transport
- V4 SSE / HTTP envelope 解包和校验
- spark-page-config 拥有的 pageDesign AI business registration
- pageDesign 的 lifecycle / dataset / node-tree / payload-catalog / text-model 工具目录
- pageDesign AI 工具落到 live edit host 的 bridge
- live edit workspace 加载/保存页面四文件

不覆盖：

- spark-component 渲染器运行时兼容逻辑
- Java pages-config 持久化 controller/service
- 普通页面渲染、路由、导航、组件注册表扫描

## Trace 表

| Trace ID | 文件 | 职责 |
| --- | --- | --- |
| `live-llm-entry` | `scripts/verify-page-design-leave-llm-live.mjs` | 真实“请假申请页面设计”live LLM 评测入口；只装配登录、pageDesign 注册、AiHost 会话和验收。 |
| `live-auth` | `scripts/verify-page-design-leave-llm-live.mjs` | live LLM 评测登录/外部 token 入口，后续 AI/page-config 请求复用同一组鉴权头。 |
| `live-page-workspace` | `scripts/verify-page-design-leave-llm-live.mjs` | 把真实 pages-config API 包装成 `PageConfigEditWorkspace`，供 pageDesign 工具修改四文件。 |
| `live-session-reset` | `scripts/verify-page-design-leave-llm-live.mjs` | 预建隔离 V4 session，避免 Java 后端旧会话历史污染 live 评测。 |
| `live-artifact-assertions` | `scripts/verify-page-design-leave-llm-live.mjs` | live 语义验收入口，验证 `rule.json` / `pagedata.json` 而不是快照比对。 |
| `live-orchestrator` | `scripts/verify-page-design-leave-llm-live.mjs` | live 主流程：登录、替换页面、注册 pageDesign、启动 AI、保存脏文件和远端回读。 |
| `host-session-entry` | `packages/spark-ai/src/host/business/business-session.ts` | 前端 AI 会话入口，`createAiHostBusinessSession/start/send` 从这里进入 AI Host。 |
| `host-session-start` | `packages/spark-ai/src/host/business/business-session.ts` | 调用业务 `onStartSession`，创建 sessionStore 记录，并投影 module-semantic 工具。 |
| `host-tool-loop` | `packages/spark-ai/src/host/tool-loop/tool-loop-runner.ts` | LLM round、toolCalls、工具结果回填的闭环。 |
| `host-transport-prepare-session` | `packages/spark-ai/src/host/transport/fetch-transport.ts` | V4 live 在 SSE turn 前显式创建隔离后端 session；不要和模型生成请求混合。 |
| `host-transport-stream` | `packages/spark-ai/src/host/transport/fetch-transport.ts` | 真实 Java AI 后端 `/api/ai/sessions/*` SSE 调用入口，只拿模型回复和工具调用。 |
| `host-transport-append` | `packages/spark-ai/src/host/transport/fetch-transport.ts` | 工具调用完成后的 AI 会话历史同步入口。 |
| `host-append-envelope` | `packages/spark-ai/src/host/transport/fetch-response-envelope.ts` | `appendMessages` V4 响应解包和身份校验；不代表页面四文件已保存。 |
| `host-sse-reader` | `packages/spark-ai/src/host/transport/sse-stream-reader.ts` | AI stream SSE frame 聚合入口，负责 delta/result/toolCalls，不下沉 pageDesign 业务。 |
| `host-sse-v4-envelope` | `packages/spark-ai/src/host/transport/sse-stream-reader.ts` | V4 SSE 信封校验真源，校验 transport/event/session/turn/stream。 |
| `host-sse-tool-call-payload` | `packages/spark-ai/src/host/transport/sse-stream-reader.ts` | 从 V4 result、legacy payload、OpenAI choices 提取 toolCalls 的兼容边界。 |
| `page-design-registration` | `packages/spark-page-config/src/ai/page-design-module.ts` | pageDesign AI business registration 真源；注册五个子工具到 AI Host。 |
| `page-design-lifecycle` | `packages/spark-page-config/src/ai/lifecycle-tool-catalog.ts` | pageDesign AI 的 bootstrap/progress/100-step 流程出处；只读流程与编辑态。 |
| `page-design-dataset-tool` | `packages/spark-page-config/src/ai/dataset-tool-catalog.ts` | pageDesign AI 修改 `pagedata.json` 的 ModuleKind 出处。 |
| `page-design-node-tree-tool` | `packages/spark-page-config/src/ai/node-tree-tool-catalog.ts` | pageDesign AI 修改 `rule.json` 的 ModuleKind 出处；组件 type、id、payload props 校验集中在这里。 |
| `page-design-payload-provider` | `packages/spark-page-config/src/ai/payload-catalog-tool-catalog.ts` | pageDesign AI 的组件参数荷载指南出处；`guidePayload/paramsSchema` 真源。 |
| `page-design-text-model` | `packages/spark-page-config/src/ai/text-model-tool-catalog.ts` | pageDesign AI 写 `script.js` / `style.css` 的工具目录。 |
| `page-design-live-service` | `packages/spark-page-config/src/design/page-design-service.ts` | pageDesign AI 工具共享的 live edit bridge；把 ModuleKind action 落到 `PageDesignEditHost`。 |
| `page-design-payload-guide-state` | `packages/spark-page-config/src/design/page-design-service.ts` | 当前 pageDesign 会话已获取的组件 payload guide 记录点。 |
| `page-design-payload-props-validator` | `packages/spark-page-config/src/design/page-design-service.ts` | node-tree 写入前的 props 参数校验真源，错误返回给 LLM 修正。 |
| `page-design-workspace-load` | `packages/spark-page-config/src/design/page-edit-workspace.ts` | live edit host 加载四文件的 workspace 入口。 |
| `page-design-workspace-save` | `packages/spark-page-config/src/design/page-edit-workspace.ts` | AI 工具改完四文件后的 pages-config 保存入口。 |
| `file-loader-v4-envelope` | `packages/spark-utils/src/http/FileLoader.ts` | pages-config 文件读取的 V4 HTTP envelope 解包点。 |

## 清理冗余时的边界提示

- Java AI 后端负责会话、SSE、LLM 调用和历史，不直接写 pageDesign 四文件。
- pageDesign 业务注册属于 `spark-page-config/src/ai/page-design-module.ts`。
- `PageDesignService` 是 AI 工具到前端 live edit host 的 bridge，不是页面配置远端保存层。
- `node-tree` 只代表 AI 修改 `rule.json` 的工具边界，不等同于运行时 `SparkComponentRenderer` 的全部兼容分支。
- `payload-catalog` 是 AI 生成组件 props 的指南与校验来源，清理时不要和组件运行时注册表扫描混成一处；能拿到指南的组件会做 props schema 校验。
- `SparkComponentRenderer` 运行时仍保留 registry / global-el / native / fallback 分支；AI 写入边界不再纠结非 `r-*` type，函数执行不报错则放行，后续由 live 评测语义断言兜底。
