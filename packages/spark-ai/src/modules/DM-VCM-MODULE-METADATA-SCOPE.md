# AiModule Metadata Scope

> 状态：有效。本文约束 VCM/LLM 可见的元数据边界与协议真源线。

## Metadata Graph（协议真源线）

VCM 元数据描述**对象图**，不是 `/kind[id]` 实例树：

```text
模型（AiApiObjectMetadata / rootApi）
  ├─ 属性（attributes）── attribute.api ──→ 子模块
  └─ 方法（actions）──── action.resultApis ──→ 子模块
```

- **发现**：`module_query` / `module_guide` / `module_attribute_guide` / `module_function_guide` 投影自 metadata 图（`metadata-graph.ts`）。
- **执行**：`module_script`；`this` = 会话 scope 钉死的根实例；子模块经属性链或 `await action()` 返回值上的代理链访问（`native-script-context.ts`）。
- **实例**：由会话 `registrationId + businessInstanceId`（运行时字段 `moduleInstanceId`，如 pageId）钉死；**禁止**在 LLM 知识或脚本中构造 `/kind[id]` path、`module_find` 或实例 id 链。

## Scope

元数据只描述业务能力、参数契约、嵌套 API 与失败修复建议，不描述 Vue 组件实现、service 内部状态、runner 函数体或页面渲染细节。

**业务注册唯一入口**：VCM 生成 JSON → `AiModuleAdapter`。禁止 `src/services/**` 手工 `new AiModule` 或已移除的 `createAiBusinessKit`。

LLM 固定工具（目标收敛形态）：

- 发现：`module_query`、`module_guide`、`module_attribute_guide`、`module_function_guide`
- 执行：`module_script`
- 控制：`module_memory`、`human_question`、`agent_complete`

LLM 知识层只教授 metadata 图 + `module_query` / `module_*_guide` + `module_script`；不再教授 `module_find`、`module_attr`、path 寻址或 direct function。运行时工具面迁移废除另行推进。

## Metadata Tags

- `@moduleKind` / `@moduleName` / `@moduleDescription`
- `@usageRule` / `@requiredBeforeCall` / `@failureMode`
- `@attribute`

## Rules

- 元数据不得承诺未注册的函数、属性或子模块。
- 复杂参数必须通过结构化 schema、属性契约或 resultApis 暴露。
- 失败消息必须包含可恢复的 `code/msg/fix/checks`。
- 会话历史是诊断依据，业务包只读取 transcript/summary，不复制维护第二份历史。

## 延伸阅读

- 包内实现与消费方全链路（native-runtime、Adapter 注册、ToolLoop、传输、recovery、pageDesign）：[`docs/NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md`](../../docs/NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md)
- 传输与会话 V4：[`docs/TRANSPORT-AND-SESSION.zh-CN.md`](../../docs/TRANSPORT-AND-SESSION.zh-CN.md)
- Generator / callbackApis：[`docs/VCM-GENERATOR-AND-CALLBACKAPIS.zh-CN.md`](../../docs/VCM-GENERATOR-AND-CALLBACKAPIS.zh-CN.md)
- 包架构 SSOT：[`ARCHITECTURE.md`](../../ARCHITECTURE.md)
