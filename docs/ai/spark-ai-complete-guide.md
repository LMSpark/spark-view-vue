# SPARK AI Complete Guide

> 代码即真相。本文对应 `packages/spark-ai` 当前破坏性重构后的实现，用于业务接入、协议调试、会话恢复和 AI 代码生成约束。

## Architecture

`packages/spark-ai` 分成三层：

| Public entry | Responsibility | Must not own |
| --- | --- | --- |
| `@spark-view/spark-ai/json` | JSON value/schema、参数 schema helper、参数校验、JSON 规整 | 业务语义、会话、transport |
| `@spark-view/spark-ai/modules` | `AiModule` 元数据、实例路径、固定工具 spec、工具路由、知识投影 | agent 会话、HTTP/SSE、业务 live state |
| `@spark-view/spark-ai/agent` | 业务注册、输入校验、session store、tool loop、turn callbacks、transcript/summary | 页面四文件持久化、后端网络实现 |

根入口 `@spark-view/spark-ai` 只是小 facade，保留少量最常用值和类型。新代码优先使用 focused subpath。

## Naming

当前公共概念：

- JSON 层：`AiJsonValue`、`AiJsonParams`、`AiJsonSchemaValidator`。
- 模块层：`AiModule`、`AiModuleRuntime`、`AiModuleResult`。
- Agent 层：`AiAgentHost`、`AI_AGENT_HOST`、`AiAgentSessionStore`、`DefaultAiAgentSessionStore`。

旧公共入口、旧类型名、动态业务函数工具名和协议身份数组都不是兼容面。

## Fixed Tool Protocol

运行时只向 transport 输出固定工具：

- `module_query`
- `module_guide`
- `module_find`
- `module_attr`
- `module_call`
- `human_question`

业务函数统一通过 `module_call` 调用：

```json
{
  "path": "/pageDesign[page-a]/node-tree[page-a]",
  "functionName": "addNode",
  "args": {
    "parentComponentId": "page__0",
    "node": {
      "type": "r-text",
      "id": "name",
      "props": {}
    }
  }
}
```

实例身份只来自 `path + 当前 session scope`。模型先用 `module_find` 定位实例，再用 `module_guide` 读取 schema/failure modes，最后用 `module_call` 执行业务函数。缺少用户事实时先用 `human_question` 生成反问指南，再向用户补问。

## AiModule Rules

注册只接受已构造的 `AiModule`：

```ts
const runtime = new AiModuleRuntime()
runtime.register(new PageDesignNodeTreeAiModule(options))
```

声明能力必须显式提供对应委托：

- `functions` 需要 `runner` 或 `runFunction`。
- `attributes` 需要 `attributeAccessor`。
- `children` 需要 `list` 和 `find`。
- 根模块需要 `find`，用于从 `module_find({ path: "/", childKind, query })` 解析当前业务实例。

所有业务失败返回 `AiModuleResult.failCode(code, message, hint)`，让模型读取 `code/msg/fix/checks` 后修正调用。

## Agent Host

`AiAgentHost` 暴露：

- `register(alias, registration)`
- `ensure(alias, { moduleId, create })`
- `run(alias, input, chat?)`

业务注册必须显式注入 `sessionStore`。registry 不会自动补默认 store；如果需要内存实现，业务包自己传 `new DefaultAiAgentSessionStore()`。

推荐接入形态：

```ts
const host = createAiAgentHost({ turnCallbacks, maxToolRounds: 8 })
const pageDesignHost = ensurePageDesignBusiness({
  host,
  getPageDesignEditHost,
})

await pageDesignHost.run('pageDesign', {
  pageId: 'page-a',
  userRequirement: '新增申请表单',
})
```

## Session History

会话历史是一等能力，不是可删缓存。它是下次恢复当前话题、诊断失败工具调用、续接业务实例的基础。

`AiAgentSessionStore` 需要保留：

- user message、assistant message。
- tool call args/result/error/status。
- lifecycle stop reason。
- turn/session/module identifiers。

行为约束：

- `startSession` 复用同一业务实例历史。
- `send` 追加新 turn。
- `stopSession` 只标记 lifecycle，不清空历史。
- 业务包只能读取 transcript/summary/diagnostics，不维护第二份历史。

调试入口：

- `createAiAgentSessionTranscript(record)`
- `summarizeAiAgentSessionRecord(record)`
- session store 的 `getSession()` / `getSessionHistory()`。

## PageDesign

`packages/spark-page-config/src/ai/page-design-module.ts` 是 pageDesign AI 的业务注册入口。

能力树：

- `pageDesign`
- `lifecycle`
- `text-model`
- `payload-catalog`
- `node-tree`
- `dataset`

页面设计提示词保持短，详细知识通过工具按需查询。常规顺序：

1. `module_find({ path: "/", childKind: "pageDesign", query: { id: pageId } })`
2. `module_call` 调 lifecycle 的 `describeProgress` / `describeDesignFlow`
3. 数据优先：先 dataset，再 node-tree，再 text-model/style
4. 目录组件 props 先调 payload-catalog 的 `queryPayloads` / `guidePayload`

## AI Code Generation Behavior

生成或修改代码时遵守以下约束：

- 不默认用 `interface` 表达一切；只有稳定契约、跨模块能力、DTO/config/payload 或多个实现共享协议才使用 `interface`。
- 优先按“契约 -> class 基础/默认实现 -> 具体 class -> 必要子类”的层次组织代码。
- 如果只有一个实现，默认使用具体 class 或普通函数。
- 新增泛型、工具类型和公共导出前必须有真实重复、稳定扩展点或跨模块契约。
- 函数/方法签名默认最多 3 个位置参数；4 个及以上改成具名 options/command 对象。
- 参数类型不要内联大对象或深层泛型；提取具名 type/class。
- 参数列表里不要写 JSDoc；说明放到 options type、class 字段或函数上方。
- 注释只解释契约、约束、优先级和风险。
- VCM/LLM 可见语义必须在首次声明处用自然语言注释和结构化 tag 标注。

更细的代码生成规则见 `docs/ai/ai-code-generation-behavior.md`，验证器以 `tools/verify-ai-codegen-rules.mjs` 为准。

## Verification

Spark AI 修改后至少运行：

```bash
pnpm --filter @spark-view/spark-ai run typecheck
pnpm --filter @spark-view/spark-ai run lint
pnpm --filter @spark-view/spark-ai run test:run
```

涉及 pageDesign、leave-request 或业务消费代码时补跑：

```bash
pnpm --filter @spark-view/spark-page-config run typecheck
pnpm --filter @spark-view/spark-page-config run lint
pnpm --filter @spark-view/spark-page-config exec vitest run tests/page-design-business-definition.test.ts tests/page-design-node-tree-module-semantic.test.ts tests/leave-request-module.test.ts tests/leave-application-page-design.test.ts
pnpm run typecheck
```

`verify:rules` 可能暴露非本次 spark-ai 迁移产生的历史债；本次迁移不能扩大债务，若直接阻塞当前改动则一并修复。
