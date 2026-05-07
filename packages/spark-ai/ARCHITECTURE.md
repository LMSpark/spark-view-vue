# spark-ai 架构全景

> 更新于 2026-05-07。

本文只描述当前仍在仓库中生效的 spark-ai 能力边界。旧页面生成链已删除，不再属于现行架构。

## 1. 包定位

@spark-view/spark-ai 当前承担四类职责：

1. Function Calling 函数契约、注册表、tool schema 生成与本地调度。
2. 会话后端、函数循环编排、follow-up 策略与重复检测监控。
3. `core@knowledge` 查询函数、组件 catalog 投影与参数 payload provider。
4. `page-design` 四文件编辑运行时与页面模型会话宿主。

它不再承担“页面配置整模生成闭环”的运行时职责。

## 2. 当前主链路

### 2.1 通用聊天链

AiChatWidget
-> src/services/ai-protocol.ts
-> POST /api/ai/chat/stream
-> AiChatController
-> AiStreamService

用途：纯聊天、解释、问答、SSE 增量输出。该链路主要由根应用和后端承载，spark-ai 只保留通用解析工具与类型。

### 2.2 细粒度编辑链

DevDataSetDesigner / useRuleEditSession
-> createPageModelSessionHost() / registerPageDesignEditFunctions()
-> runFunctionLoop() / SessionBackendImpl
-> POST /api/ai/sessions / turn / turn/stream / append
-> AiSessionController / session backend service

用途：rule.json、pagedata.json、script.js、style.css 的细粒度编辑与回合式工具调用。

## 3. 关键模块

### 核心函数域

- src/core/function/contracts.ts：函数地址、结果、guard、trace 与注册定义。
- src/core/function/registry.ts：当前会话函数注册表。
- src/core/function/tool-schema.ts：action/function name 映射与 tool definitions 生成。
- src/core/function/tool-dispatch.ts：LLM tool call 到本地函数执行的适配。
- src/core/function/params-validator.ts：LLM 参数结构校验。

### 会话域

- src/core/session/contracts.ts：会话、tool call、monitor、orchestrator 契约。
- src/core/session/backend.ts：前端会话后端 HTTP/SSE 客户端。
- src/core/session/orchestrator.ts：多轮函数循环编排。
- src/core/session/followup-policy.ts：失败修复与 warning follow-up 策略。
- src/core/session/repeat-monitor.ts：重复调用、只读循环与失败重试检测。

### 知识域

- src/core/knowledge/actions.ts：`core@knowledge@queryTools/guideTool/queryPayloads/guidePayload/ask`。
- src/core/knowledge/registry.ts：payload provider 注册与查询。
- src/catalog/catalog-projections.ts：组件目录到 LLM / DevSystem 所需视图的投影。
- src/business/page-design/payloads/component-payload-provider.ts：page-design 组件参数荷载源。

### 页面设计业务域

- src/business/page-design/page-model-session-host.ts：函数上下文、编辑状态和后端会话宿主。
- src/business/page-design/page-model-edit-session.ts：bootstrap/run/reset/dispose 编辑会话控制器。
- src/business/page-design/functions/*：lifecycle、textModel、nodeTree、dataset 工具目录与运行时函数。
- src/business/page-design/prompts/*：编辑模式系统提示词与执行规则。

## 4. 与后端的边界

spark-ai 依赖但不替代后端能力：

1. AiChatController / AiStreamService：通用聊天 SSE。
2. AiSessionController / session backend service：统一会话主干。
3. PageConfigController：页面配置、版本、批量写入与 SSE 广播。
4. NavigationController：导航树查询与写入。

## 5. 当前约束

1. 前端不再保留旧页面生成整模闭环，也不再调用专用页面生成端点。
2. rule / pagedata / script / style 编辑统一走 page-model edit session，不保留旧 domain 兼容层。
3. 文档、测试和接线应默认围绕 chat/stream 与 /api/ai/sessions/* 建模。

## 6. 历史说明

如需追溯 2026-04 之前的页面生成链与旧 DevSystem AI 面板方案，请直接查看 git 历史；这些内容不再保留在当前架构文档中，避免误导后续实现。
