# spark-ai 架构

`spark-ai` 是 SPARK 的 AI 运行时包。当前架构由递归模块注册运行时和模块自管服务组成。

## 运行时边界

`src/core` 是模块实现与面向 LLM 的宿主之间的确定性运行时边界：

- 定义统一的面向 AI 标准：模块信息 -> 递归模块 -> 函数信息注册。
- 模块实现 `AiModuleRegistration`，并通过 `AiFunctionRegistration` 暴露函数。
- 顶层模块通过 `AiRuntime.registerModule` 注册。
- 模块路径和函数统一暴露为 `module/.../function`。
- 通过 `moduleId + moduleInstanceId` 启动、暂停、停止和恢复运行实例。
- 通过 `moduleId + moduleInstanceId` 定位当前实例和历史。
- 保存每个实例的历史、函数调用记录、活动路径和函数曝光快照。
- 通过显式运行时 `instanceId` 执行单次函数调用。
- 发布生命周期、历史、活动路径和函数事件。

运行时不拥有业务服务生命周期，不创建领域服务状态，不直接调用 LLM，不重试模型轮次，也不维护进程级全局函数注册表。模块实现负责自管状态，并可通过 `releaseInstance` 释放实例级状态。

## 契约模型

- **注册图**
  - `AiModuleRegistration` 表示一个模块节点；模块可以通过 `modules` 递归包含其他模块。
  - `AiFunctionRegistration` 表示挂在某个模块路径下的可调用 action 契约。
  - action 路径格式为 `module/.../function`，例如 `pageDesign/nodeTree/addNode`。
- **类型规则**
  - 公共契约使用普通接口，不使用深层泛型约束。
  - 业务代码用本地普通接口表达 payload 类型，并在 schema 校验后自行转换。
- **上下文参数**
  - 模块节点可以声明 `instanceParam`，例如 `departmentId`。
  - 运行时会把父级模块实例参数投影到面向 LLM 的 `paramsSchema`。
  - 运行时在调用 `execute` 前剥离这些注入字段。
  - 业务实现从 `FunctionExecutionContext.moduleInstances` 读取选中的模块实例。
- **活动路径**
  - 活动路径由宿主通过 `setActivePath`、`clearActivePath` 和 `getActivePath` 管理。
  - 函数执行成功不会隐式改变活动路径。

## 公共入口

迁移后的调用方应使用：

- `AiRuntime.registerModule`
- `AiRuntime.startInstance({ moduleId, moduleInstanceId })`
- `AiRuntime.stopInstance({ instanceId, mode: 'pause' | 'stop' })`
- `AiRuntime.stopInstanceByModuleScope({ moduleId, moduleInstanceId, mode })`
- `AiRuntime.getAvailableFunctions(instanceId)`
- `AiRuntime.getInstanceByModuleScope({ moduleId, moduleInstanceId })`
- `AiRuntime.executeFunctionCall({ instanceId, action, args })`
- `AiRuntime.setActivePath({ instanceId, bindings })`

包根入口刻意不再导出旧 API，例如 `registerBusiness`、`AiBusinessRegistration`、`AiBusinessModuleRegistration` 或 `PageDesignBusiness`。

## 验证

本包的重点验证命令：

```bash
pnpm --filter @spark-view/spark-ai run typecheck
pnpm run test:run -- --config vitest.spark-ai.config.ts tests/ai-runtime-business.test.ts tests/page-design-business-definition.test.ts tests/protocol-parser-json-extract.test.ts tests/llm-params-validator.test.ts --reporter verbose
```
