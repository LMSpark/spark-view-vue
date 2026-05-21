# SPARK AI Host 使用边界指南

> `@spark-view/spark-ai` 当前只暴露 `schema`、`module-semantic`、`host`。业务能力直接注册到 Host，不再经过旧的公共入口或 adapter。

## 定稿链路

```text
业务服务
  -> ModuleKind
  -> ModuleSemanticRuntime
  -> AiHostBusinessRegistration
  -> Host tool loop
  -> AI Backend / LLM
```

## 核心约束

- `spark-ai` 不导入业务包，不持有业务 live state。
- 业务包创建 `ModuleSemanticRuntime` 并注册标准 `ModuleKind` class；action 执行由 `ModuleKind.runner(ctx, actionName, args)` 完成。
- Host 注册对象统一为 `AiHostBusinessRegistration`。
- LLM 工具固定为 6 个协议工具：`listChildren`、`findInstance`、`describeKind`、`invokeAction`、`getAttribute`、`setAttribute`。
- 业务 action 参数由 action 自身的 `paramsSchema` 校验。
- Host 负责 `AiHostSessionRecord` 历史；业务 release 只清 live state。

## 公开入口

```ts
import { LlmSchemaValidator, paramsSchema } from '@spark-view/spark-ai/schema'
import { ModuleSemanticRuntime, ModuleKind } from '@spark-view/spark-ai/module-semantic'
import { AiHostBusinessRegistry, startRegistrationSession } from '@spark-view/spark-ai/host'
```

禁止使用或恢复：

- 旧 core 公共 subpath
- 旧 protocol 公共 subpath
- 旧业务 runtime adapter
- 旧 action path 解析链路
