# AiModule Metadata Scope

> 状态：有效。本文约束 VCM/LLM 可见的 AiModule 元数据边界。

## Scope

AiModule 元数据只描述业务能力、实例发现、参数契约和失败修复建议，不描述 Vue 组件实现、service 内部状态、runner 函数体或页面渲染细节。

**业务注册唯一入口**：VCM 生成 JSON → `AiModuleAdapter`。禁止 `src/services/**` 手工 `new AiModule` 或已移除的 `createAiBusinessKit`。

LLM 只能通过固定工具理解语义：

- `module_query`、`module_guide`、`module_attribute_guide`、`module_function_guide`
- `module_find`、`module_attr`、`module_call`
- `module_script`、`module_memory`
- `human_question`、`agent_complete`
- 业务函数 direct tool：`<functionName>`

嵌套 API（VCM `resultApis`）通过 `module_script` 链式调用；复杂参数通过 JSON Schema、属性契约和返回 API 契约暴露。

## Metadata Tags

- `@moduleKind` / `@moduleName` / `@moduleDescription`
- `@usageRule` / `@requiredBeforeCall` / `@failureMode`
- `@attribute`

## Rules

- 元数据不得承诺未注册的函数、属性或子模块。
- 复杂参数必须通过结构化 schema、属性契约或 resultApis 暴露。
- 失败消息必须包含可恢复的 `code/msg/fix/checks`。
- 会话历史是诊断依据，业务包只读取 transcript/summary，不复制维护第二份历史。
