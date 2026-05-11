# spark-ai 架构

`spark-ai` 是 SPARK 的 AI 能力包。当前架构由“core 会话历史层 + 模块自管服务 + AI 会话宿主”组成。

## Core 边界

`src/core` 是模块实现与 LLM 宿主之间的确定性协议层：

- 定义统一的模块注册契约：模块信息、递归子模块、函数知识。
- 将 `AiModuleRegistration` / `AiFunctionRegistration` 投影为 LLM 可见的 prompt 与 tool schema。
- 将 LLM 提交的 `rootInstanceId[/childInstanceId]@moduleId@actionName` 调用翻译成注册方可执行的调用参数和 `FunctionExecutionContext`。
- 将注册方执行函数得到的原始结果序列化为 LLM tool result 内容。
- 接收 `startInstance` / `stopInstance` 会话通知，保存 AI session record，并返回 Started/Stopped 快照。
- 统一保存 UI 人工输入、LLM 回复和 LLM 编排的函数调用历史。

core 明确不做：

- 不创建、恢复、暂停、销毁模块服务实例。
- 不保存模块运行状态，不维护 active path 状态，不发布事件。
- 不执行函数体，不做函数调用编排、重试或轮次推进。
- 不验证函数执行结果，不依据执行结果决定下一步。

## 中心语义

AI core 的中心不是模块实体，而是会话管理：

```text
A 模块实例
  -> C 模块注册
  -> B core 会话管理
  -> LLM 函数编排
  -> B core 记录 requested / 翻译调用 / 回填 completed 或 failed
  -> A 模块实例执行真实函数
```

这条链路里，B 保存的是 AI 会话轨迹：UI 人工输入、LLM 回复、LLM 编排的函数调用、函数结果回传。A 保存的是模块运行状态：页面、数据集、节点树、文本模型等领域对象。两者都可以有状态，但状态语义不同。

AI 会话隔离键固定为 `moduleId + moduleInstanceId`，对应“模块注册 ID + 根模块实例 ID”。`instanceId` 是技术 envelope/alias，用于兼容宿主传输和函数上下文；同一根模块实例重新 start 时可以更新 alias，但不能把它切成多条 core session。

`registerModule` 不是一次性写入动作；注册成功后 core 会返回 `AiRegisteredModuleApi`。这个 API 绑定当前 `moduleId`，让注册方以同一个句柄完成 AI 会话数据链路：`startInstance/projectModule -> appendMessage -> translateFunctionCall -> recordFunctionCallRequest -> createFunctionResultMessage -> completeFunctionCall -> stopInstance`。模块服务的创建、缓存、释放仍由注册方在这个句柄外自行组合。

同一个注册句柄可以并行承载多个根模块实例：例如 page-design 使用不同页面 ID 作为 `moduleInstanceId`，就能同时开展多个页面设计。core 按 `moduleId + moduleInstanceId` 拆分 AI session/history；page-design 模块自身也按 `moduleInstanceId` 拆分编辑状态。`stopInstance` 只结束 AI 会话，不释放页面编辑状态；释放必须由注册方显式调用自身的服务释放 API。

## 数据链路反推

从“多个页面设计实例并行工作”反推，链路必须满足：

- 函数调用：LLM 只能使用当前 session projection 中的 `action + args`。action 必须带根模块实例 ID，例如 `page-a@textModel@writeScript`；子模块实例继续放在 `/` 路径里。实例路径段按 URI 编码，因此 `lmspark/homepage` 会投影为 `lmspark%2Fhomepage@...`，翻译时再还原为真实实例 ID。
- 知识体系：`projectModule` / `startInstance` 基于 `moduleId + moduleInstanceId` 生成当前 session 的 promptSnapshot、模块树和 availableFunctions；这些描述、schema、usageRules、failureModes 本质上都是给 LLM 的提示词材料。
- 注册信息：`AiModuleRegistration` 只提供模块身份、函数和子模块；core 在注册期校验同一注册树内 `moduleId` 唯一，因为 LLM action 使用模块段和动作段定位能力。
- 会话账目：UI 人工输入、LLM 回复、LLM 发起的函数调用、函数执行结果都写入同一个 `moduleId + moduleInstanceId` session history。
- 模块运行状态：页面编辑状态不进入 core，由 page-design 自身按 `moduleInstanceId` 维护；AI session 停止不释放页面服务状态。

只要 action 中的根实例 ID、projection 的 session scope、注册树的唯一模块 ID、history 的隔离键都一致，函数调用 -> LLM 知识体系 -> 注册信息之间就不会断链。

## 模块与宿主职责

- **模块实现层**：维护自身运行状态，管理服务生命周期，声明函数目录，并执行真实函数体。
- **AI 会话宿主层**：负责模型通讯、tool schema 投递、tool call 转发、重试策略、追问、暂停/停止决策和 active path 输入。
- **core 层**：保存通用 AI 会话轨迹，消费宿主当前传入的 scope、projection、active path 和 tool call，并返回确定性的知识投影或翻译结果。

## 契约模型

- `AiModuleRegistration` 表示一个模块目录节点；它只描述当前模块身份、提示词、函数与子模块。
- `AiFunctionRegistration` 表示挂在某个模块目录下的函数知识，内部函数键只用于注册和翻译；LLM-facing 投影只暴露 action、参数、结果和使用规则。
- LLM-facing action 不来自目录元数据，而是 core 在会话投影时生成；路径格式为 `rootInstanceId[/childInstanceId]@moduleId@actionName`，例如 `page-designer@nodeTree@addNode`。
- 模块节点可以声明 `instanceParam`，core 会把相关模块实例参数投影到 LLM `paramsSchema`。
- 函数调用翻译成功后，core 会从执行参数中剥离注入的上下文实例字段，注册方从 `FunctionExecutionContext.moduleInstances` 读取。

## 公共入口

迁移后的调用方应使用：

- `const moduleApi = AiRuntime.registerModule(registration)`
- `moduleApi.startInstance({ moduleInstanceId, instanceId })`
- `moduleApi.projectModule({ moduleInstanceId, instanceId, runtimeInstanceId })`
- `moduleApi.appendMessage({ moduleInstanceId, instanceId, runtimeInstanceId, role, content })`
- `moduleApi.translateFunctionCall({ moduleInstanceId, instanceId, runtimeInstanceId, action, args, projection })`
- `moduleApi.recordFunctionCallRequest(...)`
- `moduleApi.createFunctionResultMessage({ action, result })`
- `moduleApi.completeFunctionCall(...)`
- `moduleApi.stopInstance({ moduleInstanceId, instanceId })`

裸 `AiRuntime` 仍保留全局查询和兼容入口：

- `AiRuntime.getModuleRegistration`
- `AiRuntime.listModuleRegistrations`
- `AiRuntime.getSession(instanceId)`
- `AiRuntime.getSessionByModuleScope({ moduleId, moduleInstanceId })`
- `AiRuntime.getSessionHistory(instanceId)`
- `AiRuntime.getSessionHistoryByModuleScope({ moduleId, moduleInstanceId })`
- `AiRuntime.appendMessage({ ...scope, role, content })`
- `AiRuntime.appendFunctionCall({ ...scope, action, args, result })`
- `AiRuntime.startInstance({ moduleId, moduleInstanceId, instanceId })`
- `AiRuntime.stopInstance({ moduleId, moduleInstanceId, instanceId })`
- `AiRuntime.projectModule(scope)`
- `AiRuntime.translateFunctionCall({ ...scope, action, args, activePath, projection })`
- `AiRuntime.createFunctionResultMessage({ action, result })`

包根入口刻意不再导出旧 API，例如 `registerBusiness`、`AiBusinessRegistration`、`AiBusinessModuleRegistration` 或 `PageDesignBusiness`。

## 验证

本包的重点验证命令：

```bash
pnpm --filter @spark-view/spark-ai run typecheck
pnpm run test:run -- --config vitest.spark-ai.config.ts tests/ai-runtime-business.test.ts tests/page-design-business-definition.test.ts tests/protocol-parser-json-extract.test.ts tests/llm-params-validator.test.ts --reporter verbose
```
