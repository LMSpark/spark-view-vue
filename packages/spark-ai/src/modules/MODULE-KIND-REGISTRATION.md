# AiModule 注册

> 状态：有效。本文约束 VCM/LLM 可见的 AiModule 元数据边界与注册路径。

## Scope

**业务注册唯一入口**：`AiModuleAdapter` + VCM 生成的 `AiModuleMetadataJson`。禁止在 `src/services/**` 手工 `new AiModule` 或已移除的 `createAiBusinessKit`。

LLM 固定工具：`module_query`、`module_guide`、`module_attribute_guide`、`module_function_guide`、`module_find`、`module_attr`、`module_call`、`module_script`、`module_memory`、`human_question`、`agent_complete`，以及业务 direct function tools。

嵌套 API（VCM `resultApis`）通过 `module_script` 执行；复杂参数通过 JSON Schema、属性契约和返回 API 契约暴露。

## Metadata Tags

- `@moduleKind` / `@moduleName` / `@moduleDescription`
- `@usageRule` / `@requiredBeforeCall` / `@failureMode`
- `@attribute`

## Rules

- 元数据不得承诺未注册的函数、属性或子模块。
- `AiModuleRuntime.register()` 仅供框架内部；业务方不得直接调用。
- 会话历史由 `AiAgentSessionStore` 统一管理；业务包不维护第二份完整历史。
