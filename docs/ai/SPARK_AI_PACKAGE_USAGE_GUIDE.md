# SPARK AI Platform 使用边界指南

> AI 平台、AI 中心、Runtime、AI Backend 和业务注册的最新定稿以 [SPARK_AI_PLATFORM_ARCHITECTURE_BOUNDARIES.md](./SPARK_AI_PLATFORM_ARCHITECTURE_BOUNDARIES.md) 为 SSOT。

## 定稿链路

```text
App AI Center 启动 SSE 服务
  -> Spark AI Runtime SSE
  -> Spark AI Runtime
  -> AI Backend <=> LLM
  -> AI Backend
  -> Spark AI Runtime SSE
  -> App AI Center SSE 服务
```

函数调用链路：

```text
业务服务 ==注册==> spark-ai ==函数调用契约<==> 业务服务函数执行
```

## 核心约束

- App AI Center 只负责启动 SSE 服务和 AI 包传输。
- APP 不导入 `spark-page-config`，不注册业务，不创建业务 service，不维护业务状态。
- `spark-ai` 是 AI Runtime：负责协议、SSE、函数调用契约、会话运行时规则、tool codec、参数校验和知识投影。
- `spark-ai` 的核心按纯函数方式收边：输入 runtime state/event/registry snapshot，输出 next state 和外部命令；副作用只能通过显式 port/adapter 执行。
- AI Backend 负责 LLM 会话、模型调用、持久化和 SSE stream。
- 业务服务拥有业务状态和业务函数实现，只通过契约注册给 `spark-ai`。
- 业务编排由 LLM 实现，`spark-ai` 不替业务决定流程。

## App AI Center

App AI Center host 的目标职责只有：

- 启动 SSE 服务或连接。
- 把用户输入、后端 SSE event 和 AI 包交给 `spark-ai`。
- 把 `spark-ai` 输出的 SSE event 或 AI 包送回 UI/网络边界。

它不得持有业务 registry，也不得包装 page-design、leave-request 等业务模块。

## 业务注册

业务服务在自己的包内声明并注册 AI 能力：

```text
业务状态 / 业务 service
  -> 业务函数契约
  -> spark-ai registration
  -> LLM tool schema
  -> tool call
  -> 业务 service invoke
```

注册内容只描述“这个业务能做什么”和“如何按契约调用”，不把业务状态搬进 `spark-ai`。

## 会话隔离

显式业务 scope 仍由两段组成：

```ts
{
  businessRegistrationId: 'pageDesign',
  businessInstanceId: activePageId,
}
```

`spark-ai` 可以用它建立 runtime scope，但真实业务实例仍属于业务服务，LLM 会话持久化仍属于 AI Backend。

## 函数调用闭环

1. AI Backend 通过 SSE 返回 LLM 的 `tool_call`。
2. `spark-ai` 解析 tool call、校验 action 和参数 schema。
3. `spark-ai` 通过业务注册契约调用业务服务函数。
4. 业务服务执行副作用并返回可序列化结果。
5. `spark-ai` 把 tool result append 回 AI Backend。
6. AI Backend 继续调用 LLM，直到 LLM 给出下一步 tool call 或 final answer。

## 禁止事项

- 不恢复旧 app AI 业务注册入口。
- 不恢复 `@spark-view/spark-ai/registrations` 作为具体业务模块出口。
- 不让 `spark-ai` import `spark-page-config`、`spark-app` 或任何具体业务 service。
- 不让 App AI Center host 成为业务 runtime factory。
