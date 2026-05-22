# SPARK AI Host 使用边界指南

> 当前公开入口：`@spark-view/spark-ai`、`@spark-view/spark-ai/schema`、`@spark-view/spark-ai/module-semantic`、`@spark-view/spark-ai/host`。

## 定稿链路

```text
业务服务
  -> ModuleKind
  -> ModuleSemanticRuntime
  -> AiHostBusinessRegistration
  -> Host tool loop
  -> AI Backend / LLM
```

## 推荐导入

```ts
import { LlmSchemaValidator, paramsSchema } from '@spark-view/spark-ai/schema'
import {
  ModuleKind,
  ModuleOperationResult,
  ModuleSemanticRuntime,
  type ModuleActionMetadata,
  type ModulePathContext,
} from '@spark-view/spark-ai/module-semantic'
import {
  AiHostBusinessRegistry,
  AiHostFetchTransport,
  startRegistrationSession,
} from '@spark-view/spark-ai/host'
```

## 核心约束

- `spark-ai` 不导入业务包，不持有业务 live state。
- 业务包创建 `ModuleSemanticRuntime` 并注册标准 `ModuleKind` class。
- action metadata 使用 `ModuleActionMetadata`，`paramsSchema` 使用 `LlmJsonSchemaObject`。
- Host 注册对象统一为 `AiHostBusinessRegistration`。
- LLM 工具固定为 6 个协议工具：`listChildren`、`findInstance`、`describeKind`、`invokeAction`、`getAttribute`、`setAttribute`。
- Host 负责 `AiHostSessionRecord` 历史；业务 release 只清 live state。

## 禁止使用或恢复

- 旧 `core` 公共 subpath
- 旧 `protocol` 公共 subpath
- 旧业务 runtime adapter
- 旧 namespace 类型；协议类型必须从 `module-semantic` 顶层导入
- 旧参数 schema 薄别名；参数根必须直接使用 `LlmJsonSchemaObject`
