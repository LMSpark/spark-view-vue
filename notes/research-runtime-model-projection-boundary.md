# Runtime Model Projection Boundary 研读记录

## 用户确认后的任务边界

本轮只处理 `spark-ai` runtime 如何通过模型投影 JSON 认识具体业务模型结构的问题，不处理业务实例来源。业务实例后续可由具体业务参数投影到构造函数参数并实例化。

需要验证两条路径：

1. 模型投影 JSON 已由外部提供，runtime 通过声明式引用配合动态导入或动态解析获得模型类引用。
2. 模型投影 JSON 在测试或工具链中由 TypeScript compiler API 动态生成。

两条路径都需要测试证明 `spark-ai` runtime 核心不直接 import `ProjectModel`、`pageDesign` 或 `projectPlanning`，同时仍能消费具体模型结构。

补充约束：函数调用对应的是运行时 JavaScript，不是 TypeScript。TS class / JSDoc / dts / compiler API 负责生成模型投影 JSON；实际可执行函数必须落到 JS 构造器、JS 原型方法或 JS 模块导出上。因此“模型投影来源”和“可执行函数来源”需要在设计上分清，不能把 TypeScript 投影误当成可直接执行的函数实现。

## 已研读文件与职责

- `notes/research-agent-workflow-designer-business-shape.md`：明确 workflow 设计器与业务模型的产品边界；ClassModel 是业务类的投影，TS class + JSDoc 是源头，生成的 dts class model 是查询/索引/缓存，不是产品设计中心。
- `packages/spark-ai/docs/business-factory-workflow-zh-cn.md`：定义业务工厂 workflow 的产品契约；发布图只允许 `start`、`node`、`output`；`node.model` 绑定 ClassModel 上下文；设计器不维护手写 registry。
- `knowledge/README.md`、`knowledge/class-model-system.md`：确认 ClassModel 系统的事实源是 TS class + JSDoc，生成 bundle 是工具索引/缓存。
- `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts`：定义 `AgentWorkflowDefinition` 和 `AgentWorkflowNodeRuntimeBinding`。当前 `knowledge` 只有 `rootClassName`、`manifestUrlRef`，`moduleClassRef` 只有 `kind`，还没有表达动态导入或动态生成投影的结构化字段。
- `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts`：做同步 JSON shape 校验；当前深校验 `runtimeBinding`，但只校验 `knowledge.manifestUrlRef`，不解析 ClassModel 或 runtime 行为。
- `packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts`：runtime 解释 `runtimeBinding`，通过 `moduleClassResolver`、`knowledgeProviderFactory` 等 app 注入能力创建 registration；核心没有直接 import `ProjectModel`。
- `src/services/ai/agent-workflow-bindings.ts`：app 组合层当前直接 import `ProjectModel`，并用 `moduleClassResolver` 返回；`createAgentWorkflowKnowledgeProvider` 里硬编码 dts manifest URL 和 worker URL。
- `src/services/page-design/page-design-agent-workflow-binding.ts`、`src/services/project-planning/project-planning-agent-workflow-binding.ts`：仍包含 page design / project planning 的 prompt、gate、knowledge/provider 组装逻辑，是业务侧绑定实现。
- `tools/generate-workflow-design-data.mjs`：生成 workflow design/definition JSON，当前 `runtimeBinding` 写入 `moduleClassRef.kind`、`knowledge.manifestUrlRef`、gateRules 等声明。
- `tools/verify-workflow-designs.mjs`：校验落盘 workflow JSON；当前只检查 `runtimeBinding` 的现有字段。
- `packages/spark-ai/src/tests/agent-workflow-definition.test.ts`：覆盖 workflow definition 校验与 runtimeBinding 解释；测试通过手写 `createRuntimeBindings` 提供 module class、knowledge provider 等能力。
- `packages/spark-ai/src/tests/class-model-agent-adapter-dts-knowledge.test.ts`：已有基于 `buildDtsClassModelBundle` 的 JSON 投影测试，可证明 dts bundle 能驱动 ClassModel agent adapter，但 module class 仍由测试静态提供。
- `packages/spark-ai/src/class-model/class-model/dts-class-model-bundle-loader.ts`：通过 manifest URL 和 `fetchJson` 加载 dts class model bundle，并能构造 runtime API metadata。
- `packages/spark-ai/src/class-model/class-model/dts-surface-to-runtime-api.ts`：将 dts JSON surface 转换为 runtime API metadata。
- `packages/spark-ai/src/agent/native-runtime/dts-native-script-runner.ts`：用 manifest URL + rootClassName 构建 metadata，并将外部提供的业务实例包进 script context。
- `packages/spark-ai/src/class-model/class-model/class-model-to-json-schema.ts`：已有 TypeScript compiler API 路径，当前偏 JSON schema 投影。
- `scripts/generate-dts-class-model.mjs`：已有 compiler API declaration emit 和 `buildDtsClassModelBundle` 生成链路，是方式 2 的主要参考。

## 调用链与数据流

当前 workflow runtime 路径：

1. 设计器或生成脚本产出 `AgentWorkflowDefinition`，业务节点上带 `runtimeBinding`。
2. `interpretAgentWorkflowDefinition` 找到单个业务节点，读取 `runtimeBinding`。
3. runtime 调用 `bindings.moduleClassResolver(runtimeBinding.moduleClassRef)` 获得 module class。
4. runtime 调用 `bindings.knowledgeProviderFactory(runtimeBinding.knowledge)` 获得 ClassModel knowledge provider。
5. runtime 将 module class、knowledge provider、system prompt、gate 等组装成 `ClassModelAgentAdapter` registration。

当前模型投影数据流：

1. TS class + JSDoc 是事实源。
2. dts/TS 投影链路生成 dts class model bundle JSON。
3. `DtsClassModelBundleLoader` 通过 manifest URL 和 `fetchJson` 读取 JSON bundle。
4. loader 可构造 runtime API metadata 或支持 knowledge query。
5. agent adapter 当前仍需要外部传入 module class。

## 已识别约束

- `spark-ai` runtime 核心不能直接 import 业务模型。
- runtime 可以依赖声明式 `runtimeBinding` 和外部注入 resolver，但 resolver 的业务 import 不应进入 runtime 核心。
- JSON 投影能描述模型结构和 runtime API metadata，但不能凭空产生业务实例；本轮不处理实例来源。
- 函数调用最终执行 JavaScript；TypeScript/dts 投影只提供 schema、API surface 和调用约束，不是执行体。
- 已生成的 `generated/dts-class-model/manifest.json` 是 bundle manifest：`schemaVersion: 1`、`protocol: "spark-appworks.dts-class-model.bundle"`、`classIndex[className] -> { sourcePath, file }`、`files[sourcePath] -> { file, module }`。
- `ProjectModel` 的 manifest 条目为：
  - `classIndex.ProjectModel.sourcePath = "packages/spark-project-model/src/project/project-model.ts"`
  - `classIndex.ProjectModel.file = "files/packages/spark-project-model/src/project/project-model.ts.json"`
  - `files[sourcePath].module.packageName = "@spark-appworks/spark-project-model"`
  - `files[sourcePath].module.modulePath = "project/project-model"`
  - `files[sourcePath].module.symbols = ["ProjectModel"]`
- per-file shard 是 `DtsFileProjectionBundleJson`：`schemaVersion: 3`，顶层字段是 `module`、`$defs`、`models`，不是旧的 `projection.models`。
- raw shard 为了去重不直接保留成员级 `paramsSchema` / `returnSchema`；这些 schema 位于 `$defs.ProjectModel.$defs`，例如 `constructor.params`、`method.openPageDesign.params`、`method.openPageDesign.return`。读取时必须走 `readDtsFileProjectionDocument` / `DtsClassModelBundleLoader`，由 `hydrateModelSchemasFromJsonSchema` 从 `$defs` 恢复成员 schema。
- shard 的 `models.ProjectModel.classDecl.constructorMeta` 记录构造参数投影：`constructor(options: ProjectModelInitOptions)`；`classDecl.members.methods` 记录 48 个方法，包括 `openPageDesign`、`readPlanningProjection`、`readProjectPlanningInput`、`editNodeTree`、`editDataSet` 等。
- 生成物里的 `module.packageName` + `module.modulePath` 是模型投影的模块语义定位，不等价于可直接执行的 JS import specifier。当前 `packages/spark-project-model/package.json` 只公开 `"."` export；`modulePath: "project/project-model"` 对应源码/内部 dist 路径，但 package exports 没有 `./project/project-model` 子路径。
- 当前可执行 JS 入口事实是：`packages/spark-project-model/src/index.ts` 和 `dist/index.js` 从包根导出 `ProjectModel`。因此对现有 `ProjectModel`，可执行 import 更接近 `import("@spark-appworks/spark-project-model").ProjectModel`，而不是 `import("@spark-appworks/spark-project-model/project/project-model").ProjectModel`。
- 如果采用动态导入，必须考虑安全边界，不能让落盘 JSON 任意 import 任意模块；需要受控引用或 allowlist resolver。
- 如果采用 compiler API 动态生成 JSON，测试应优先复用已有 `buildDtsClassModelBundle` / compiler API declaration emit 链路，避免另建平行投影系统。
- `agent-workflow-validation.ts` 当前只做 JSON shape 校验，不应变成真正的 ClassModel 解析器。
- 既有 `class-model-agent-adapter-dts-knowledge.test.ts` 已覆盖“JSON 投影可驱动 knowledge/runtime metadata”的一部分，但还未覆盖 workflow runtime 通过声明式模型引用解耦业务 import。

## 潜在影响面

- `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts`：可能需要扩展模型类引用或模型投影引用字段。
- `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts`：如果新增字段，需要同步 JSON shape 校验。
- `packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts`：可能需要调整 module class / projection 的解释边界。
- `packages/spark-ai/src/class-model/**`：方式 2 可能需要提取或复用 compiler API 生成能力，避免只存在于脚本文件里。
- `packages/spark-ai/src/tests/**`：需要新增或扩展测试，分别覆盖方式 1 和方式 2。
- `src/services/ai/agent-workflow-bindings.ts`：app 层可能需要实现受控动态解析或引用表。
- `tools/generate-workflow-design-data.mjs`、`tools/verify-workflow-designs.mjs`、`tests/services/workflow-designs.test.ts`：如果 runtimeBinding JSON schema 增加字段，需要同步。

## 本轮不纳入

- 不处理业务实例来源。
- 不改 pageDesign/projectPlanning 的具体业务 gate 逻辑。
- 不把 runtime 改成直接 import 任何业务模型。
- 不把生成 bundle 当作产品设计事实源；它仍是模型投影缓存/索引。

## 验证结果

### JS 可执行入口 dynamic import

已用 Node 探针验证：

- `import("@spark-appworks/spark-project-model").ProjectModel` 可用，导出 `ProjectModel`，类型为 function。
- `import("@spark-appworks/spark-project-model/project/project-model")` 失败，错误为 `ERR_PACKAGE_PATH_NOT_EXPORTED`。
- `import("./packages/spark-project-model/dist/project/project-model.js").ProjectModel` 可用，但这是 dist 内部文件路径，不适合作为 workflow JSON 的稳定协议。
- `node --import tsx` 下 `import("./packages/spark-project-model/src/index.ts")` 和 `import("./packages/spark-project-model/src/project/project-model.ts")` 可用，但这是开发/测试运行器能力，不是发布后的 JS 入口协议。
- 用包根动态 import 得到的 `ProjectModel` 可以实际构造实例并调用 JS 方法：`new ProjectModel({ projectId }).readPlanningProjection()` 返回数组，`readProjectPlanningInput()` 返回对象。

结论：现有生成物的 `modulePath` 不能直接拼成 JS import specifier。可执行 JS 入口应显式声明，或由生成物/包导出元数据明确提供；对当前 `ProjectModel`，实际稳定入口是包根 `@spark-appworks/spark-project-model` + export `ProjectModel`。

### 已生成投影 JSON loader

已用 `DtsClassModelBundleLoader` 读取 `generated/dts-class-model/manifest.json` 并构建 `ProjectModel` runtime metadata：

- constructor params schema 可恢复。
- root action count 为 48。
- `openPageDesign`、`readPlanningProjection` 均存在。
- `openPageDesign.paramsSchema`、`openPageDesign.resultSchema`、`readPlanningProjection.paramsSchema` 均可恢复。
- `apiRegistry` 能加载关联模型，例如 `ProjectDesign`、`ProjectModelData`、`ProjectNodeData`、`ConfigPageNode` 等。

结论：方式 1 的“已有模型投影 JSON -> loader -> runtime metadata”链路已通；读取 raw shard 不可靠，必须通过 reader/loader hydration。

### TypeScript compiler API 动态生成投影 JSON

已用临时目录验证完整闭环：

1. 写入临时 TS 源文件 `DemoRuntime`。
2. 用 TypeScript compiler API `ts.createProgram(...).emit(..., emitDeclarationOnly: true)` 生成 `class-model-emit/.../demo-runtime.d.ts`。
3. 用现有 `buildDtsClassModelBundle` 生成临时 `generated/dts-class-model/manifest.json` 和 shard。
4. 用 `DtsClassModelBundleLoader` 构建 `DemoRuntime` runtime metadata。
5. 另写临时 JS 模块 `demo-runtime.mjs`，通过 dynamic import 获得 `DemoRuntime` JS class，并实际调用 `echo()`。

验证结果：

- manifest 成功写入 `classIndex.DemoRuntime -> packages/demo-runtime/src/demo-runtime.ts`。
- module meta 生成 `packageName: "@spark-appworks/demo-runtime"`、`modulePath: "demo-runtime"`、`symbols: ["DemoRuntime"]`。
- constructor params schema、`echo` action params schema、`echo` result schema 均可恢复。
- JS dynamic import 返回 function，实际调用结果为 `{ "message": "js:ok" }`。

结论：方式 2 可通。TS compiler API 只负责生成 `.d.ts` 与投影 JSON；可执行体仍来自 JS module。

### Workflow runtime 当前同步边界

当前 `AgentWorkflowRuntimeBindings.moduleClassResolver` 是同步函数：

```ts
moduleClassResolver: (ref: AgentWorkflowNodeModuleClassRef) => AgentWorkflowModuleConstructor<TInstance>
```

`interpretAgentWorkflowDefinition` 与 `activateAgentWorkflowFromDefinition` 也是同步函数。真正由 runtime 自己执行 `import()` 会引入 Promise，因此不能无缝塞进现有同步 API。

结论：若坚持“runtime 自己 dynamic import”，需要新增 async workflow 解释/激活路径，或把现有路径整体改 async。较稳妥做法是保留现有同步 API，新增 async API 覆盖动态 import 场景。

## 已确认方向

本轮先确定走线路 1 作为生产运行路线：

- 生产运行时消费已生成的模型投影 JSON。
- 生产运行时通过 JS dynamic import 获得可执行 class。
- TypeScript compiler API 不进入生产运行时；它只作为发布前生成/验证投影 JSON 的链路。
- 本轮落地重点先放在“已有模型投影 JSON + JS executableRef dynamic import”的 runtime 解释和测试上。

已确认落地范围：全链路落地。范围包含 `spark-ai` runtime、workflow definition schema/validation、workflow JSON 生成脚本、workflow verify 脚本、app 绑定层和相关测试。

补充确认：设计时不做业务模型深校验。Workflow 设计器只保存声明引用，不解析/验证 `ProjectModel`、pageDesign 或 projectPlanning 的具体模型结构；业务模型结构以发布前编译生成的模型投影 JSON 为准。运行时或发布验证只需要基于生成物 fail-fast，不把设计器变成 ClassModel 校验器。

Async 边界决策：本轮采用 Promise 化的统一 runtime 路径，不保留旧 `moduleClassResolver` 双协议。所有可执行业务模型由 `runtimeBinding.executableRef` 声明，workflow runtime 负责 dynamic import JS module 并读取导出。`interpretAgentWorkflowDefinition` / `activateAgentWorkflowFromDefinition` 需要改为 async 或返回 Promise；app 侧现有激活函数已经是 async，可顺势 `await`。这样避免同时维护旧 resolver 和新 executableRef 两套入口。

LLM 调用链确认：

- LLM 可见工具闭集是 `model_query`、`model_class_guide`、`model_attribute_guide`、`model_action_guide`、`model_script`、`human_question`、`agent_complete`。
- LLM 不直接调用 `ProjectModel.openPageDesign` 这类函数工具；它先用 query/guide 读取 ClassModel 知识，再唯一通过 `model_script({ script })` 提交 JavaScript async function body。
- `model_script.script` 明确禁止 TypeScript/TSX/JSX/import/export/类型注解/interface/type，也不要包 async function/function。
- `executeDtsNativeScript` 用 `manifestUrl + rootClassName` 从投影 JSON 构建 runtime API metadata，再把脚本绑定到当前业务根实例。
- `createAiApiScriptContext` 基于 runtime API metadata 暴露可调用 action 和 attribute proxy，最终沿 JS 原生对象链调用。
- 因此 `executableRef` 不属于 LLM 知识体系，也不应暴露给 LLM。它只服务 runtime 装配：找到 JS root class，构造/获取实例后交给 `model_script` 执行上下文。

`executableRef` 字段结构决策：采用 `{ kind: "js-module", moduleSpecifier, exportName }`。`moduleSpecifier` 指向稳定 JS 包/模块入口，`exportName` 指向运行时构造器导出；不从投影 JSON 的 `modulePath` 自动拼 JS import。

`modelProjectionRef` 字段结构决策：从现有 `knowledge` 中拆出独立字段，采用 `{ kind: "dts-class-model", manifestUrlRef, rootClassName }`。模型投影是 runtime contract，用于构建 runtime API metadata；LLM knowledge/provider 是基于该投影提供 query/guide 的服务形态，不再把投影引用伪装成 knowledge。

迁移策略决策：破坏性替换。删除旧 `runtimeBinding.knowledge` 投影字段和 `runtimeBinding.moduleClassRef`，所有生成物、校验、runtime、app 绑定和测试同步迁移到 `modelProjectionRef` + `executableRef`，不做旧字段兼容层。

Manifest URL 解析决策：保留 `modelProjectionRef.manifestUrlRef`，不在 definition 中写死部署 URL。runtime binding 提供通用 `manifestUrlResolver(ref: string): string`；app 实现可继续调用现有 `getDtsClassModelManifestUrl()` 解析 `dts-class-model`。这样 workflow JSON 只保存稳定资源引用，部署 URL 由运行环境决定。

Knowledge provider 决策：保留 `knowledgeProviderFactory`，但输入从旧 `knowledge` 改为新的 `modelProjectionRef`。runtime 仍不固定 worker/direct provider 形态；app 可继续创建 worker provider，测试可注入 direct provider。

实例解析决策：本轮暂时保留 `editorGetterRegistry`，不处理业务实例来源，不改成构造函数参数实例化。落地只替换模型 class 的 JS dynamic import 和模型投影引用；实例生命周期后续单独设计。

后端测试接口确认：`spark-ai-server/src/main/java/com/spark/ai/controller/AiDirectTurnTestController.java` 提供 `POST /api/ai/test/direct-turn`，直接接收 `systemPrompt`、`messages`/`turnMessages`、`tools`、`mode`、`scope` 等字段，返回非流式 LLM turn result，不走 APP SSE。该接口用于模型 guide / tool calling 验证，能覆盖 LLM 是否按 ClassModel 工具体系产出 tool calls；它不直接替代前端 runtime 激活测试，因为它不负责 dynamic import JS executable 或执行 `model_script`。

测试策略决策：本地单元/脚本测试为必跑；新增或保留后端 `direct-turn` 探针作为可选自动脚本，检测到后端与 LLM 配置时执行，检测不到时跳过，不放入默认 CI 硬门禁。
