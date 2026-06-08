# ClassModel 反射层方案审计

> 审计对象：`.cursor/plans/ClassModel反射图定型方案.md` 与当前 `packages/spark-ai/src/vcm-native/` 实现。
> 结论：第一阶段 ClassModel 投影层已对齐；结构化 JSDoc 语义、7 个 OpenAI tool 的独立 vcm-native runtime handler 已落地；构建阶段可生成并验证运行时可消费的 metadata。

## 1. 已对齐项

- 新协议隔离在 `packages/spark-ai/src/vcm-native/`，旧 `modules/*` 只作为输入适配来源。
- 没有手工改写 `src/services/page-design/page-design-module-metadata.runtime.generated.json`；所有变更均由生成命令产出。
- `ClassModel` 已定型为 `kind/className/name/declaration/jsdoc/constructor/attributes/methods`。
- `attributes` 与 `methods` 均携带 `JsDocMeta`。
- 子模型入口统一为 `childModels`，包含 `attribute`、`return`、`callback-param` 三类。
- `editNodeTree` 与 `editDataSet` 已从旧 `resultApis` 归一成 `callback-param`，不是 return。
- `$defs` 继续保留在 `ClassModelDocument.$defs`，不重新发明池化/去重/JSON Schema 标准化。
- component catalog 不并入 ClassModel 主图，只在 guide 投影时按需合并。
- d.ts-like 文本只在 projection/guide 阶段即时生成，不写入 generated JSON。
- 7 个 VCM-native tool 名已收敛为闭集常量。
- generator 已从具体源码 class / constructor / attribute / method 首次声明搬运 JSDoc 语义；AI runtime compact 只保留消费必需的 `description/jsdoc.tags/paramName`，不保留 `raw/provenance`。
- 生成阶段读取 `tsconfig.catalog.json` 编译选项，跨包 import 优先通过 workspace paths 解析到 `packages/*/src`。
- 生成阶段建立源码 class 索引；当 TypeScript 类型入口仍来自 `dist/types/*.d.ts` 时，按 className 与路径映射回 `src/*.ts` 实现声明，源码声明是 JSDoc/VCM 语义 SSOT。
- `VcmNativeRuntime` 已在 `vcm-native/runtime` 内独立提供 7 个 tool handler，不接入旧 `modules/runtime` 注册协议。

## 2. 已发现并修正的偏差

### 2.1 ClassModel 多出 `description`

偏差：实现里额外放了 `description: string`，方案中的 `ClassModel` 没有该字段。

原因：从旧 metadata 迁移时顺手保留了 `api.description`，但语义已经能由 `jsdoc.summary` 表达。

处理：已删除 `ClassModel.description`，避免协议定型后出现两套说明入口。

### 2.2 guide 投影只完整覆盖 method

偏差：原实现有 `renderMethodGuide`，但缺少与工具闭集对应的 model/attribute guide 入口。

原因：第一版按验收用例优先实现了 `vcm_method_guide(editNodeTree)`。

处理：已补 `renderModelGuide` 与 `renderAttributeGuide`，并从 `vcm-native` 和 `knowledge` 出口导出。

### 2.3 method 数量测试是硬编码计数

偏差：测试写死 `project=4/config-page=6/...`，只能证明当前快照，不能证明“method 数量与当前 action 数一致”。

原因：最初为了快速锁定 6 个模型与当前 runtime metadata 对账。

处理：已改成直接从 runtime metadata 的 `actions.length` 对账 ClassModel 的 `methods.length`。

### 2.4 apiRegistry 内联子 API 收集不够稳

偏差：原收集逻辑主要从 root 递归，未来如果 registry 内部继续挂内联 API，可能漏收。

原因：当前 page-design runtime 里 6 个模型都在 root/apiRegistry 中，测试不会暴露该问题。

处理：已改为队列式收集 root、apiRegistry、attribute.api、resultApis.api。

## 3. 已消除的阶段性偏差

### 3.1 JSDoc 语义没有真实数据源

状态：已修正。

处理：

- VCM metadata generator 已补 `jsdoc?: JsDocMeta`。
- `model/attribute/method/constructor` 均从源码声明搬运 JSDoc summary/tags/paramName。
- `vcm-native` 适配层优先读取 `jsdoc`；旧字段只作为迁移期兜底。
- 已用 `pnpm run generate:module-metadata` 刷新生成物，runtime metadata 中 `project/config-page/data-table/data-view/dataset/node-tree` 均可还原 ClassModel JSDoc。

### 3.2 7 个 OpenAI tool 只有闭集命名，未接真实 handler

状态：已修正。

处理：

- `VcmNativeRuntime.getTools()` 返回固定 7 个 OpenAI tool spec。
- `vcm_query` 从 `ClassModelDocument` 查询模型与成员摘要。
- `vcm_model_guide/vcm_attribute_guide/vcm_method_guide` 调用 projection。
- `vcm_method_guide(addNode, componentType: "r-table")` 按需合并 component catalog。
- `vcm_script` 只调用注入的 script executor。
- `human_question/agent_complete` 在 vcm-native runtime 内闭环表达。
- 本阶段未接入旧 agent loop，旧 `modules/*` 未新增新协议 runtime 逻辑。

## 4. 验证口径

已通过：

- `pnpm --filter @spark-appworks/spark-ai run lint`
- `pnpm --filter @spark-appworks/spark-ai run typecheck`
- `pnpm --filter @spark-appworks/vite-plugin-spark-catalog run typecheck`
- `pnpm run generate:module-metadata`
- `pnpm exec vitest run packages/spark-ai/src/vcm-native/tests/class-model.test.ts packages/vite-plugin-spark-catalog/src/tests/module-metadata-generator.test.ts packages/vite-plugin-spark-catalog/src/tests/module-api-registry-compact.test.ts packages/vite-plugin-spark-catalog/src/tests/module-schema-pool.test.ts`

当前测试覆盖：

- 从当前 runtime metadata 生成 6 个模型。
- `methods.length === source actions.length`。
- return/callback-param 子模型边归一。
- method guide 不泄露 `resultApis/callbackApis`。
- model/attribute guide 可渲染。
- ClassModel 若携带 raw JSDoc，projection 会优先保留；AI runtime compact 默认不写 raw。
- generator 遇到 `.d.ts` 与源码实现重复声明时，优先反射源码实现声明，不使用旧 dist JSDoc。
- generator 可在没有 dist build 输出的情况下，通过 `tsconfig.catalog.json` paths 反射跨包源码声明。
- `addNode + r-table` 可合并 component catalog 的 `RTableProps` 知识。
- 7 个 VCM-native tool 名闭集与 handler。

## 5. 跨构建迭代状态

当前完成：

- 阶段 A：源码优先反射已落地。generator 读取 `tsconfig.catalog.json`，workspace 包 import 优先解析到 `packages/*/src`；`.d.ts` 入口会映射回源码 class。
- 阶段 B：构建产物一致性检查已落地。`module-metadata-cli --verify-build-consistency` 会在生成阶段跑 source/type-entry 双入口对账，不一致则失败。
- 阶段 C：生成阶段 provenance 已落地。API model/constructor/attribute/method 在反射阶段可携带 `provenance`，但 AI runtime compact 不写入 `provenance`；缺 JSDoc 的源码位置作为构建日志输出。
- 阶段 D：CI 串联命令已落地。快速路径为 `pnpm run verify:vcm-native`，完整跨构建路径为 `pnpm run verify:vcm-native:full`。

待后续迭代：

- 阶段 E：旧入口收口。需要在新工具面稳定后再清理旧 `modules/*`。

执行原则：

- 源码 class 是 JSDoc/VCM 语义 SSOT。
- 构建产物用于验证发布类型没有滞后，不作为语义真源。
- 若跨构建对账失败，先修改方案或 build/declaration 链路，再重新生成 metadata；不在 projection/runtime 层补猜测逻辑。

本次新增验证：

- `pnpm run verify:vcm-native`
- `pnpm run verify:vcm-native:full`

最终构建生成验收：

- 已构建 `@spark-appworks/spark-utils`。
- 已构建 `@spark-appworks/spark-json-document`。
- 已构建 `@spark-appworks/spark-data`。
- 已构建 `@spark-appworks/spark-project-model`。
- 已执行 `pnpm run generate:module-metadata -- --verify-build-consistency`，source/type-entry 双入口对账通过。
- 已构建 `@spark-appworks/spark-ai`，`./vcm-native` 导出进入 dist。
- 已执行根级 `pnpm run typecheck`，应用侧可消费生成后的 runtime metadata。

## 6. runtime metadata 池化复核

原则：

- 体积优化不是目标，只是生成物卫生指标。
- 核心目标是知识体系成立：构建阶段完成源码/class 反射，AI/Worker 消费 `runtime.generated.json` 中的 schema/JSDoc tags/$defs，再投影成 d.ts-like guide string。
- 不再输出 `*.runtime.audit.generated.json`。审计诊断只在 generator 内存中完成，并通过 CLI 日志输出；一旦需要 LLM 消费，就必须从 runtime/ClassModel projection 取完整类型。
- 反射只负责结构、类型、源码 JSDoc 搬运与闭包校验；字段业务语义必须来自源码 JSDoc/VCM 注释，不能靠反射猜。

本次复核对象：

- `src/services/page-design/page-design-module-metadata.runtime.generated.json`

结论：

- `$defs` 总数：102。
- 直接引用 `$defs`：63。
- 传递可达 `$defs`：102。
- 缺失 `$defs` 引用：0。
- 死 `$defs`：0。
- `QueryParams` 已进入 `$defs`。
- `Map` 未再进入 `$defs`，反射为宽对象；Map/Set 属于 JS 运行时集合，不是 VCM 业务模型。
- TypeScript 标准库/外部对象不进入字段级 VCM 语义 todo，避免把 `Error.name/message/stack` 这类外部字段当成源码待补项。

修正点：

- `spark-json-document` 新增 `$defs` 公共能力：
  - `extractJsonSchemaLocalDefs`
  - `standardizeJsonSchemaWithLocalDefs`
  - `findMissingJsonSchemaDefRefs`
- `vite-plugin-spark-catalog` 不再私有处理 QueryParams 这类本地 `$defs`，而是调用 `spark-json-document`。
- 产物测试新增缺失 `$defs` 引用检查，避免 Draft 2020-12 形式通过但引用悬空。

体积分布：

- AI runtime compact JSON：165083 bytes / 2 行。
- inspection pretty JSON：331367 bytes，仅供人工审阅，不是消费面。
- runtime compact 不包含 `raw/provenance`；`source` 仅剩 1 处业务 schema 字段 `$defs.NavContextConfig.properties.source`。
- 构建日志输出三类闭环信息：`runtime knowledge audit`、`schema semantic todo build log`、`JSDoc todo build log`。
- `schema semantic todo build log` 只记录源码字段缺 JSDoc/VCM 描述的位置；JSDoc 完整的源码位置不输出。

判断：

- 当前 `$defs` 池化闭包正确，体积主要来自必要 schema 与 action 面；不是 `$defs` 池化失败。
- AI runtime 只保留 guide/Worker 消费所需内容；JSDoc raw 与 provenance 归构建阶段，不进入 AI 消费文件。
- 已拆成 AI 消费 compact 产物与构建期日志诊断，不再让消息层/Worker 消费审计 JSON。
- 新增知识完整性验收：从 `runtime.generated.json -> ClassModel -> guide` 能投影出属性类型、方法参数类型、返回类型与子模型类型，例如 `pid: string`、`getFileText(name: "rule.json" | ...): string`、`getNodeTree(): SparkNodeTree`。
- 当前知识覆盖率：`attributes=69/69`、`methodParams=154/154`、`methodReturns=108/154`、`childModelMethods=20`、`schemaDescriptions=312/795`；剩余描述缺口必须回源码 JSDoc/VCM 注释补齐后重新生成。

## 7. runtime / knowledge / Worker 边界

边界修正：

- runtime 主要负责执行：OpenAI tool dispatch、参数校验、`vcm_script` 调度、agent lifecycle。
- 执行设计会涉及 page/tree/dataset/host 等多对象引用，不适合 Web Worker 来回传递。
- knowledge 负责查询：ClassModel 索引、guide 投影、component catalog 合并、JMESPath 类审计过滤。
- Worker 只适合承载 knowledge 查询和索引缓存，不承载 `vcm_script` 执行。

已落地：

- 新增 `ClassModelKnowledgeService` 与 `VcmNativeKnowledgeProvider`。
- `VcmNativeRuntime` 支持注入 `knowledge provider`；未注入时才用 `ClassModelDocument` 创建默认 knowledge service。
- `VcmNativeRuntime` 不再直接遍历 ClassModel 或调用 projection；它只把 `vcm_query/vcm_*_guide` 转发给 knowledge provider。
- 已补测试：runtime 可以不传 `document`，只注入 knowledge provider；`vcm_script` 仍收到同一个 host 对象引用。
- Worker 通信使用成熟组件 Comlink，主线程不自研 requestId/pending RPC。
- 主线程 Worker provider 只传 `metadataUrl/componentCatalogUrl`，不 import、不 parse、不 post 大 JSON。
- 主线程 Worker client 不依赖 `spark-json-document`；`spark-json-document` 只在 Worker handler 侧用于 `$defs/$ref` 公共审计。
- Worker init 只加载 runtime metadata；component catalog 仅在 `methodGuide` 带 `componentType` 时按需 lazy fetch，并缓存。
- `modelGuide/attributeGuide/methodGuide` 返回纯 string，作为 LLM 投喂文本；不把 projection 对象继续暴露给 LLM 面。
- 已新增 pageDesign Worker 入口与 provider factory：
  - `src/services/page-design/page-design-vcm-knowledge.worker.ts`
  - `src/services/page-design/page-design-vcm-knowledge-provider.ts`

后续 Worker 形态：

- Worker provider 只实现 `query/modelGuide/attributeGuide/methodGuide` 四个 knowledge 方法。
- 主线程 runtime 继续持有 script executor 与真实业务对象。
- Worker 与主线程之间只传 URL、小 JSON 查询参数和 guide string，不传执行对象。
- 构建阶段继续生成可用 metadata，不把源码反射推迟到运行时。

## 8. 语义日志闭环与池化描述保留验收

问题复盘：

- 构建日志已经能按源码首声明聚合待补项，但 runtime coverage 仍有 11 个 schema 描述缺口。
- 逐项对账后确认：源码 JSDoc/VCM 语义已经进入原始 `moduleMetadata`，缺口发生在 `buildModuleMetadataPooledDocument` 池化/标准化阶段。
- 因此这次不能继续“按日志补源码”；应修生成链路，否则日志为 0 但 AI 消费产物仍不闭环。

已修正：

- `spark-json-document/schema-standardize`：单分支 `allOf/anyOf/oneOf` 解包时保留外层 `description`，用于 `allOf: [{ $ref }] + @param description` 这类命名 DTO 参数包装。
- `vite-plugin-spark-catalog/module-schema-pool`：把 `{ description }` 视为合法 annotation-only schema 并内联保留，不再掉成裸 `true`。
- 新增回归测试：
  - annotation-only schema 保留。
  - 单分支 `$ref` 包装保留参数描述。
  - 标准化解包 `$ref` 时保留 wrapper description。

最新生成验收：

- 命令：`pnpm run generate:module-metadata -- --verify-build-consistency`
- build consistency：通过。
- runtime audit：`models=6 defs=126 directDefRefs=74 reachableDefs=126 missingDefRefs=0 deadDefs=0`。
- knowledge coverage：`attributes=90/90 methodParams=154/154 methodReturns=108/154 childModelMethods=20 schemaDescriptions=796/796`。
- schema semantic todo：`sourceTodos=0 rawEntries=0`。
- JSDoc todo：`sourceTodos=0 rawEntries=0`。
- runtime compact：`208815 bytes`。
- runtime pretty inspection：`404433 bytes`。
- ClassModel pretty inspection：`437028 bytes`。

抽检闭环：

- `DataColumn.defaultValue` 保留 `description: 默认值`。
- `editNodeTree.run` / `editDataSet.run` 保留回调参数语义。
- `replaceFromJson.options`、`recomputeColumns.options`、`loadFromServer.params`、`retrieveRecord.options` 仍是 `$ref`，同时保留参数描述。
- `forEachView.cb`、`updateEditingValue.value` 保留开放类型参数语义。
- `loadFromServer.resultSchema.data` 保留返回数据语义。

验证：

- `pnpm exec vitest run packages/spark-json-document/src/tests/json-schema-standardize.test.ts packages/vite-plugin-spark-catalog/src/tests/module-schema-pool.test.ts packages/vite-plugin-spark-catalog/src/tests/json-schema-draft2020-audit.test.ts`
- `pnpm exec vitest run packages/spark-ai/src/vcm-native/tests/class-model.test.ts`
- `pnpm --filter @spark-appworks/spark-json-document run typecheck`
- `pnpm --filter @spark-appworks/vite-plugin-spark-catalog run typecheck`
- `pnpm --filter @spark-appworks/spark-data run typecheck`
- `pnpm --filter @spark-appworks/spark-project-model run typecheck`
