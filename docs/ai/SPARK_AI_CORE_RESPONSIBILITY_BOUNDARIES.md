# SPARK AI 源码职责边界

> 本文是 `@spark-view/spark-ai` 源码职责 SSOT。当前只允许四个公开入口：包根、`schema`、`module-semantic`、`host`。

## 一句话结论

`@spark-view/spark-ai` 是框架无关的 AI Host 与 module-semantic 协议包。它负责 LLM JSON Schema、模块语义协议、Host 会话记录、工具循环、传输契约和 APP SSE 事件桥接；它不拥有 page-design、leave-request 等业务 live state，也不导入 Vue、Element Plus、Router 或 `spark-page-config`。

## 物理分层

```text
packages/spark-ai/src/
├── schema/
├── module-semantic/
│   ├── protocol/
│   ├── internal/
│   ├── runtime/
│   └── host/
└── host/
    ├── business/
    ├── session/
    ├── tool-loop/
    └── transport/
```

详细源码树以 `packages/spark-ai/ARCHITECTURE.md` 为准。

## 职责边界

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| `schema` | `LlmJsonValue`、`LlmJsonSchemaObject`、schema helper、`LlmSchemaValidator` | 业务语义、工具循环、会话状态 |
| `module-semantic/protocol` | `ModuleKind`、`ModulePath`、`ModuleOperationResult`、`ModulePathContext`、metadata 类型 | 参数解析路由、Host 历史 |
| `module-semantic/runtime` | runtime 组合根、协议工具路由、参数解析、结果 JSON 投影 | 业务状态、LLM 传输 |
| `host/session` | 会话历史和函数调用历史 | 业务 live state |
| `host/tool-loop` | LLM round loop、tool-call executor、result mapper、payload codec、diagnostic event | 具体业务动作 |
| `host/transport` | transport 抽象、fetch/SSE、HTTP envelope、SSE stream reader | 模型策略、业务函数执行 |
| `host/transport/app-sse-events.ts` | 订阅 APP 公共 `/api/events`、解 v4 envelope、校验 SSE event、发射规范化事件 | 路由跳转、截图上传、通知 UI、页面诊断面板 |
| 业务包 | 注册 `ModuleKind`、提供业务 service 和 live state | 改写通用 AI 协议 |

## 调用链路

1. 业务创建 `ModuleSemanticRuntime`。
2. 业务注册标准 `ModuleKind` class。动作通过 `runner(ctx, actionName, args)` 执行，发现通过 `list` / `find` 委托完成。
3. 业务返回 `AiHostBusinessRegistration`，`runtime` 字段指向该 `ModuleSemanticRuntime`。
4. Host 启动会话，调用 `runtime.getLlmTools()` 暴露固定 6 个协议工具。
5. LLM 通过 `listChildren("/")`、`findInstance("/", kind, {})`、`describeKind(kind)` 发现能力。
6. LLM 通过 `invokeAction(path, actionName, args)` 执行业务动作。
7. 协议层按 action 的 `paramsSchema: LlmJsonSchemaObject` 校验参数，再委托目标 `ModuleKind`。
8. Host 记录 `AiHostSessionRecord / AiHostHistoryEntry / AiHostFunctionCallResult`。

## 维护红线

- 不要让 `spark-ai` 直接或间接导入 `spark-page-config`。
- 不要让 `spark-ai` 直接导入 Vue、Element Plus、Router 或页面组件。
- 不要把 route、screenshot、notification 的业务处理下沉到 `spark-ai`；`spark-ai` 只提供 APP SSE 订阅和事件发射。
- 不要恢复旧 `core/protocol/adapter` 公共 subpath。
- 不要把业务 live state 放进 Host session store。
- 不要用私有参数 DSL；action 参数必须是标准 JSON Schema object root。
