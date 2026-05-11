# @spark-view/spark-ai

SPARK 的 AI 能力包。核心层采用递归模块注册架构：core 统一管理 AI 会话和历史记录，把模块能力投影给 LLM，把 LLM 函数调用翻译成注册方可执行的上下文，并把注册方执行结果序列化回 LLM。

## 主要职责

- `core`：递归模块注册、AI 会话历史、LLM 知识投影、函数调用翻译、函数结果回传协议、参数 payload 提供者注册表。
- `registrations`：`page-design` 四文件编辑注册入口（`rule.json`、`pagedata.json`、`script.js`、`style.css`）、模块自有状态和真实函数执行。
- `registrations/page-design/payloads`：page-design payload provider、目录投影与 DevSystem 预计算元数据。

## 核心层语义

- **统一叫模块**：不再把领域语义写入 core 概念；模块通过 `modules` 递归形成树。
- **目录元数据**：模块目录只描述注册内部函数键和子模块 `modules`；目录不描述调用路径，也不把内部函数键投喂给 LLM。
- **函数路径**：LLM-facing action 由 core 按当前 AI 会话投影生成，格式为 `rootInstanceId[/childInstanceId]@moduleId@actionName`，例如 `page-designer@nodeTree@addNode`。
- **实例路径编码**：action 中的实例路径段会 URI 编码后再投影，例如页面 ID `lmspark/homepage` 会变成 `lmspark%2Fhomepage@...`，core 翻译时还原真实实例 ID。
- **中心链路**：模块实例先通过注册把知识交给 core；之后 LLM 的函数编排必须经过 core session，再回到模块实例执行。
- **注册句柄**：`registerModule` 返回绑定 `moduleId` 的 `AiRegisteredModuleApi`，注册方用它串起会话开始、知识投影、消息记录、函数调用记录、翻译、结果回传和会话停止。
- **隔离边界**：AI 会话以 `moduleId + moduleInstanceId` 隔离，也就是“模块注册 ID + 根模块实例 ID”；`instanceId` 只是技术 envelope/alias。
- **并行实例**：同一个模块注册可以同时服务多个 `moduleInstanceId`，例如多个页面设计会话并行工作；每个根页面实体拥有独立 session/history 和模块自有状态。
- **AI 会话记录**：`startInstance` / `stopInstance` 与 AI 会话生命周期一致；core 保存 session 状态、UI/LLM 消息和 LLM 编排的函数调用历史。
- **模块实例归属**：`moduleInstanceId`、active path、模块运行状态和服务释放都由注册方或会话宿主管理。
- **函数执行边界**：core 不执行函数、不调度函数链、不依据函数结果做编排或结果验证；函数调用以 `recordFunctionCallRequest` / `completeFunctionCall` 写入同一条 session 账目。
- **结果回传**：注册方执行函数后，可用 `createFunctionResultMessage` 把原始结果序列化为 LLM tool result；下一步由 LLM/宿主决定。

## 分层入口

- `@spark-view/spark-ai/core`：核心协议、知识投影、函数调用翻译与参数 payload 提供者注册表。
- `@spark-view/spark-ai/registrations`：模块注册入口（含 page-design）。
- `@spark-view/spark-ai/registrations/page-design`
- `@spark-view/spark-ai/registrations/page-design/payloads`
- `@spark-view/spark-ai`：聚合入口。

## 开发命令

```bash
pnpm --filter @spark-view/spark-ai run build
pnpm --filter @spark-view/spark-ai run typecheck
pnpm --filter @spark-view/spark-ai run test:run
```

## 进一步阅读

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [../../docs/ai/README.md](../../docs/ai/README.md)
