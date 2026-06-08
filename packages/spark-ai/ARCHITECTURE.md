# spark-ai 架构

> 状态：有效（2026-06）。旧 `src/modules` 体系已经物理删除；不保留向后兼容入口。

## 公共入口

| 入口 | 职责 |
|------|------|
| `@spark-appworks/spark-ai` | 根门面，仅导出常用稳定符号 |
| `@spark-appworks/spark-ai/json` | JSON Schema、参数校验、JSON 值规整 |
| `@spark-appworks/spark-ai/vcm-native` | VCM runtime metadata、ClassModel、guide、7 工具闭集 |
| `@spark-appworks/spark-ai/agent` | Host、注册、会话、ToolLoop、传输、native-runtime |

`@spark-appworks/spark-ai/modules` 不存在；package exports、tsconfig alias、Vite alias 都不应再出现该入口。

## 物理边界

```text
packages/spark-ai/src/
├── json/                 # 框架无关 JSON/Schema 能力
├── vcm-native/           # VCM metadata -> ClassModel -> guide/tool runtime
│   ├── metadata/         # runtime generated JSON 的 schema / resolve / validate
│   ├── class-model/      # 面向 LLM 的类模型投影
│   ├── projection/       # d.ts-like model / attribute / action guide
│   ├── knowledge/        # ClassModel 查询，可切到 worker provider
│   ├── runtime/          # VcmNativeRuntime，7 工具闭集
│   └── tools/            # VCM_NATIVE_TOOL_NAMES
└── agent/
    ├── business/         # Host 注册、业务 adapter、scope、task
    ├── native-runtime/   # this 绑定、Proxy、sandbox、脚本执行
    ├── tool-runtime/     # AiAgentToolRuntime/AiAgentToolResult 抽象
    ├── tool-loop/        # LLM tool loop 与 recovery
    ├── session/          # session store、trace、diagnostics
    └── transport/        # app-sse / session-turn 契约
```

## 主数据流

```text
TypeScript 能力类 + JSDoc
  -> vite-plugin-spark-catalog
  -> page-design-module-metadata.runtime.generated.json
  -> resolveModuleMetadataJson()
  -> createClassModelDocumentFromRuntimeDocument()
  -> VcmNativeAgentAdapter.register()
  -> AiAgentRegistration(runtime = AiAgentToolRuntime)
  -> createAiAgentHost().run()
  -> ToolLoop exposes VCM-native tools to LLM
  -> vcm_script
  -> executeAiNativeScript()
  -> createAiNativeScriptContext()
  -> business instance mutation
```

## 工具闭集

| 工具 | 用途 |
|------|------|
| `vcm_query` | 查询 ClassModel，选择需要阅读的模型或成员 |
| `vcm_model_guide` | 输出单个模型的 d.ts-like declaration |
| `vcm_attribute_guide` | 输出单个属性 guide |
| `vcm_action_guide` | 输出单个 action guide，可合并组件 props 知识 |
| `vcm_script` | 执行脚本，`this` 绑定业务根实例 |
| `human_question` | 缺事实或需人工判断时提问 |
| `agent_complete` | 结束当前生产线并给出最终摘要 |

运行时同样按闭集校验参数。旧 direct-call 参数如 `path`、`functionName`、`methodName`、`code` 不做 alias，也不会被静默接受。

## 注册模型

业务侧只通过 `VcmNativeAgentAdapter` 注册：

```typescript
VcmNativeAgentAdapter.register({
  host,
  alias: 'page-design',
  moduleClass: ProjectModel,
  metadata: pageDesignRuntimeMetadataDocument,
  options: {
    resolveInstance,
    getModuleInstanceTitle,
    inputContract,
    knowledge,
  },
})
```

Adapter 内部完成：

1. 解析 runtime metadata。
2. 生成 `ClassModelDocument`。
3. 创建 `VcmNativeRuntime`。
4. 包装成 `AiAgentToolRuntime`。
5. 注册 `AiAgentRegistration`。

## native-runtime

`native-runtime` 是脚本执行层，不负责 LLM 知识投影。

| 文件 | 职责 |
|------|------|
| `native-script-context.ts` | 从 metadata + instance 生成链式 API surface |
| `native-script-runner.ts` | 解析 root metadata 并执行脚本 |
| `native-script-sandbox.ts` | `with(this){...}` 执行、异常投影、recovery hint |

`vcm_script` 的执行对象由 registration 的 `resolveInstance` 提供。脚本中的子对象来自业务方法返回值或 callback 参数，不经过旧 path 寻址。

## pageDesign 消费

`src/services/page-design-business.ts` 是 APP 侧唯一业务注册入口：

```text
ensurePageDesignBusiness()
  -> createPageDesignVcmKnowledgeProvider()
  -> VcmNativeAgentAdapter.register()
  -> resolvePageDesignProject()
```

DevSystem 通过 `page-design-ai-runner.ts` 触发 `host.run()`，审批与闸门在 `AiToolApprovalBridge`、`page-design-gates.ts` 两层完成。AI 默认只改内存，是否保存由用户或 E2E 显式触发。

## 不向后兼容约束

- 不恢复 `src/modules` 目录。
- 不导出 `@spark-appworks/spark-ai/modules`。
- 不注册 companion module。
- 不教授或执行旧 path/direct-call 协议。
- 不把 `module_*` 工具名映射到 `vcm_*`。
- 不把 `code` 映射到 `script`。
- 不把 `methodName`、`functionName`、`name` 映射到 `actionName`。

## 验证

常用命令：

```bash
pnpm run typecheck
pnpm --filter @spark-appworks/spark-ai test:run
pnpm run test
```

架构守卫：

- `tools/verify-architecture.mjs` 要求 spark-ai public subpath 精确为根、`json`、`agent`、`vcm-native`。
- `tools/verify-ai-codegen-rules.mjs` 盯住 `VcmNativeRuntime` 的公共方法面，防止旧 runtime 形状回流。
