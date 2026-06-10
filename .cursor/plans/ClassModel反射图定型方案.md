# ClassModel 反射层定型与隔离落地方案

> 状态：执行审计文档（已与实现对齐，2026-06）。
> 目标：`ClassModel` 作为 VCM-native 知识层的稳定投影，不与旧 `modules/*` 协议系统混写。

## 1. 主线

```text
runtime.generated.json（module + apiRegistry + $defs）
  -> ClassModelDocument（只存 module，不预存 models）
  -> attribute.api BFS 列 kind（vcm_query）
  -> projectClassModelForGuide（可达才投影）
  -> guide 前按需渲染 d.ts-like + JSDoc
  -> LLM 生成 vcm_script
```

`ClassModel` 是 guide 时的**瞬时投影**；真源是 `AiModuleMetadataJson`。

## 2. 目录

```text
packages/spark-ai/src/vcm-native/
  class-model/      # 投影、签名、连通性审计
  projection/       # dts-renderer
  knowledge/        # vcm_query / vcm_*_guide
  recovery/         # @failureMode 派生（不遍历图）
  runtime/          # VcmNativeRuntime 7-tool
  tests/
```

## 3. 两类边（消除歧义）

| 机制 | 边来源 | 用途 |
|------|--------|------|
| **属性链** | `attribute.api`（含 `T[]` / `Iterable<T>` 元素 kind） | `vcm_query`、`vcm_*_guide` 发现与门禁 |
| **动作图** | `action.resultApis` / callback `paramsTypeText` | `vcm_action_guide`、执行契约 |

**不要**再使用预存 `childModels` / `returnsKind` / `callbackTargetKind` / `valueKind` 旁路。

page-design 属性链（实测）：

```text
project.activePage → config-page.nodeTree → node-tree
                  → config-page.dataSetTool → dataset.tables → data-table.viewList → data-view
```

并行动作入口（非 BFS）：`openPageDesign` → `config-page`；`editNodeTree` / `getNodeTree` → `node-tree`；等。

## 4. ClassModel 形态

```ts
type ClassModelDocument = {
  schemaVersion: 1
  rootKind: string
  module: AiModuleMetadataJson
  $defs?: Record<string, AiJsonSchemaObject>
}

// guide 瞬时投影（不写入 document）
type ClassModel = {
  kind: string
  className: string
  jsdoc: JsDocMeta
  constructor?: ConstructorMeta
  attributes: AttributeMeta[]
  methods: MethodMeta[]
}
```

- `attributes`：数据入口（字段 / getter）；`attribute.api` 指向子 kind（标量或集合元素）。
- `methods`：公开 actions；签名用 `paramsTypeText` / `returnTypeText`；callback 不进单独 kind 边。

## 5. 工具闭集

```text
vcm_query
vcm_model_guide
vcm_attribute_guide
vcm_action_guide    # 非 vcm_method_guide
vcm_script
human_question
agent_complete
```

`vcm_query` 与注册 `promptSnapshot` **只列** `listAttributeReachableKinds` 结果。

## 6. JSDoc 与构建

- JSDoc 真源在源码 class / getter / method 首次声明处。
- VCM generator 解包 `T | null`、`T[]`、`Iterable<T>` 后挂 `attribute.api`。
- 连通性：`auditClassModelReflectionConnectivity`（构建 + `inspect()` warn）。

## 7. 验收

- 六 kind 属性链可达：`project` + registry 五类。
- `ClassModelDocument` 无 `models` / `diagnostics`。
- guide 无 `resultApis` / `returnsKind` 泄露。
- recovery 仅 `collectVcmFailureModeRecoveryHints`（`@failureMode`）。
- 门禁：`verify:vcm-native`（含 `audit:vcm-build-output`）、`verify:business-nudge-reconciliation`、`class-model-reflection-connectivity.test.ts`。
