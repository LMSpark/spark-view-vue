# Core 阅读顺序与功能分区

这个目录是 SPARK AI 的核心层。core 只做契约、协议、知识注册、AI 会话历史、LLM 知识投影、LLM 函数调用翻译和函数结果回传消息序列化。

核心层统一保存 AI 会话状态、UI/LLM 消息和 LLM 编排的函数调用历史；但不做模块生命周期管理，不保存模块业务状态，不维护 active path 状态，不发布事件，不执行函数体，不依据执行结果做编排，也不验证执行结果。

AI 会话按 `moduleId + moduleInstanceId` 隔离，对应“业务能力注册 ID + 根业务模块实体 ID”；`instanceId` 只是技术 envelope/alias。

模块注册目录只描述当前模块的函数和子模块。LLM-facing action 不是目录字段，而是 core 基于当前会话、根业务实体和模块层级投影出的调用地址。

由于 action 格式是 `rootInstanceId[/childInstanceId]@moduleId@functionId`，同一注册树内的 `moduleId` 必须唯一；core 会在注册期拦截重复模块 ID，避免“注册信息 -> LLM 知识体系 -> 函数调用”之间出现不可翻译的断链。

action 中的实例路径段会按 URI 编码后投影给 LLM，翻译时再解码回真实业务 ID；这允许根页面 ID 这类业务实体包含 `/` 或 `@`，同时不破坏 action 路径语法。

## 一、入口导出

- `index.ts`
  - 对外统一导出 core 能力。
  - 导出顺序按“模块契约 -> 调用协议 -> 参数校验 -> 知识负载 -> core facade”排列。

## 二、协议与契约

- `protocol/business-contracts.ts`
  - 定义递归模块注册、函数知识注册、AI 会话记录、LLM 知识投影、函数调用翻译、执行上下文和结果回传消息。
  - `startInstance` / `stopInstance` 更新 AI session record，不代表 core 创建、停止或释放模块服务实例。

- `protocol/parameter-schema.ts`
  - 参数 schema 的单一事实源。
  - 负责把叶子字符串、显式 DSL、简写对象和 unknown 归一成 validator 可识别的结构。

- `protocol/llm-params-validator.ts`
  - 校验 LLM 反序列化后的 JSON 参数。
  - 时序是：根对象检查 -> schema 归一 -> required 合并 -> 递归节点校验 -> oneOf 组合校验。

- `protocol/invocation-helpers.ts`
  - 放置和具体模型 SDK 无关的调用协议工具。
  - 包括 action 地址解析、错误归一、JSON 对象抽取和 token usage 格式化。

- `protocol/knowledge-payload-contracts.ts`
  - 定义知识负载 provider 的查询和指南接口。
  - 适合 catalog、组件知识、数据集等外部知识源接入。

## 三、知识注册

- `knowledge/payload-provider-registry.ts`
  - 内存级知识 provider 注册表。
  - 调用路径是：注册 provider -> 按 payloadRef 查询摘要 -> 按 key 获取完整 guide。

## 四、Core Facade

- `runtime/ai-runtime-support.ts`
  - `AiRuntime` 的无状态支持件。
  - 包含模块投影器、快照 clone、上下文参数注入和轻量参数校验器。

- `runtime/ai-runtime.ts`
  - core facade。
  - 主时序是：registerModule 返回 AiRegisteredModuleApi -> startInstance/projectModule -> appendMessage/translateFunctionCall -> recordFunctionCallRequest -> createFunctionResultMessage/completeFunctionCall -> stopInstance。
  - `AiRegisteredModuleApi` 只绑定 moduleId，帮助注册方保持 AI 会话数据链路不断线；业务服务实例仍由注册方自管。
  - `translateFunctionCall` 只返回 `executionArgs` 和 `FunctionExecutionContext`，函数执行由注册方完成。
  - `appendMessage` / `recordFunctionCallRequest` / `completeFunctionCall` 统一保存 AI 会话历史，不保存业务模块状态。
  - `createFunctionResultMessage` 只序列化注册方执行结果，下一步由 LLM/宿主决定。

## 五、核心边界

- core 会 clone 对外快照，避免调用方修改投影结果。
- core 只校验 action 路径、模块/函数注册一致性、上下文参数和轻量参数结构。
- core 拥有 AI session/history ledger；不拥有业务服务生命周期，不保存业务状态，不调度 LLM，不做 FC loop。
- core 不校验函数执行返回值，不读取 `ok`、`code`、`data` 等字段做流程判断。
- active path 是调用方传给 `translateFunctionCall` 的输入，不是 core 内部状态。
