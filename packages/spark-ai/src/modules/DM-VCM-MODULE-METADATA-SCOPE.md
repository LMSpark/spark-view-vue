# AiModule Metadata Scope

> 状态：有效。本文约束 VCM/LLM 可见的 AiModule 元数据边界。

## Scope

AiModule 元数据只描述业务能力、实例发现、参数契约和失败修复建议，不描述 Vue 组件实现、service 内部状态、runner 函数体或页面渲染细节。

LLM 只能通过固定工具理解语义：

- `module_query`
- `module_guide`
- `module_function_guide`
- `module_find`
- `module_attr`
- `module_call`
- `human_question`
- 业务函数 direct tool：`<functionName>`

业务函数优先通过 OpenAI direct function 执行：`functionName({ path, args })`。
`path` 由 `module_find` 返回的实例 id 和 `pathPattern` 构造；`module_call({ path, functionName, args })` 仅保留为旧协议兼容。

## Metadata Tags

- `@module`：声明 kind、名称、业务边界和适用场景。
- `@moduleFind`：声明当前 kind 在合法父路径下的实例查询语义。
- `@function`：声明 functionName、业务意图、参数含义和失败修复建议。
- `@usageRule`：函数级使用约束；生成 `usageRules[]`。
- `@requiredBeforeCall`：调用前置步骤；生成 `requiredBeforeCall[]` 并进入 `module_function_guide.recoveryHints`。
- `@failureMode`：格式 `CODE when描述 => fix描述`；生成 `failureModes[]`，FC 失败时由 enricher 按 code 反查 fix。
- `@attribute`：声明属性读取/写入语义。
- `@payloadRef`：声明复杂参数需要从哪个 payload catalog 查询。

## Rules

- 元数据不得承诺未注册的函数、属性或子模块。
- 声明 `functions` 时必须有 runner；声明 `attributes` 时必须有 accessor；声明 `children` 时必须有 list/find。
- 复杂参数必须通过 payload catalog 或结构化 schema 暴露，不能让模型从实现代码猜。
- 失败消息必须包含可恢复的 `code/msg/fix/checks`。
- 会话历史是诊断依据，业务包只读取 transcript/summary，不复制维护第二份历史。
