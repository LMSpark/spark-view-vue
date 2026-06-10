# AI 业务原生 Class 规范（VCM Native Class）

> 状态：有效（2026-06）。**VCM = 基于 TypeScript Compiler API 的业务语义编译器**：TS 类型是结构真源，源码 JSDoc/VCM tag 是业务语义真源，`generated/vcm/dist/` 是缓存产物与门禁依据。

## 0. 三层真源（禁止混层）

| 层 | 真源 | 编译器如何读取 | 消费者 |
|----|------|----------------|--------|
| **结构** | TS 类型系统 | `typescript` Program + Checker → `paramsSchema` / `returnTypeText` / attribute 类型 / `$defs` | LLM guide 签名、AJV 校验 |
| **业务语义** | 源码 JSDoc + VCM tag | `@moduleKind`、`@failureMode`、`@moduleGuard`、`@vcmSession` 等 tag 解析 | recovery hint、guard 约束、生命周期门禁 |
| **缓存产物** | `generated/vcm/dist/` | 只写不手改；`vcm-compile-report.json` 汇总 gates | Worker 按需 fetch、audit、CI |

原则：

1. **改结构** → 改 TS 签名/类型，重跑 `generate:vcm-metadata`；禁止直接编辑 `*.runtime.generated.json`。
2. **改语义** → 改 class/method JSDoc 与 VCM tag，重跑生成；metadata 不得新增第二语义通道（如 `returnsKind`、`callbackTargetKind`、预存 `models`）。
3. **改扫描面** → 改 `config/vcm/registry.json` 的 `source.files` / `roots`，再生成 + audit。

与 `tsc` 类比：TS 类型检查 ≈ 结构反射；JSDoc/VCM tag ≈ 业务 lint；dist ≈ 编译产物；`verify:vcm-native` ≈ `--noEmit` + 链接检查。

## 1. 编译系统模型

```text
┌──────────────────┐   target 声明    ┌─────────────┐    parse/reflect     ┌──────────────────┐
│ config/vcm/      │ ──────────────► │  TS 源码     │ ──────────────────► │ module-metadata   │
│ registry.json    │                 │  + JSDoc    │                     │ generator (VCM)   │
└──────────────────┘                 └─────────────┘                     └────────┬─────────┘
                                             │
              pool $defs / compact apiRegistry│
                                             ▼
                                    ┌──────────────────┐
                                    │ dist/<target-id>/ │
                                    │ manifest + kinds  │
                                    │ + compile-report  │
                                    └────────┬─────────┘
                                             │
              audit + tests                  ▼
                                    ┌──────────────────┐
                                    │ Worker 按需加载   │
                                    │ vcm_query / guide │
                                    └──────────────────┘
```

与 TypeScript 编译器类比：

| TS 编译 | VCM 编译 |
|--------|---------|
| `.ts` 源文件 | 业务 class（**类型** + **JSDoc/VCM tag**） |
| 类型检查（结构） | `paramsSchema` / `returnTypeText` / attribute 链 / `$defs` 闭包 |
| 业务 lint（语义） | lifecycle audit、`@failureMode`、`jsdoc-todo` / `schema-todo` |
| `tsc` | `pnpm run generate:vcm-metadata` |
| `dist/*.js`（缓存） | `generated/vcm/dist/<target>/`（**非 authoring 真源**） |
| 类型/语义错误 | `vcm-compile-report.json` → `gates.*` |
| `tsc --noEmit` + 链接 | `pnpm run audit:vcm-build-output` + `verify:vcm-native` |

## 2. VCM 配置流程

VCM 编译的**配置真源**在仓库根 `config/vcm/registry.json`，由 `packages/vite-plugin-spark-catalog/src/vcm-config.ts` 解析。该文件声明「扫哪些 TS」「从哪个 class 起抽」「产物写到哪里」；**不承载** AI business alias、运行时逻辑或手写 metadata。

JSON Schema：`config/schemas/vcm.schema.json`。分层约定见 `config/README.md`。

### 2.1 Registry 协议头

```json
{
  "$schema": "../schemas/vcm.schema.json",
  "protocol": "spark-appworks.vcm.registry",
  "schemaVersion": 1,
  "componentCatalogOutput": "generated/vcm/component-catalog.json",
  "metadataTargets": [ ... ]
}
```

| 根字段 | 说明 |
|--------|------|
| `protocol` | 固定 `spark-appworks.vcm.registry` |
| `schemaVersion` | 当前 `1` |
| `componentCatalogOutput` | **组件 props catalog** 输出路径；与 metadata target 解耦 |
| `metadataTargets` | 原生 class metadata 编译目标列表（至少 1 个） |

### 2.2 metadata target 结构

每个 target 的 `kind` 当前固定为 `native-metadata`。

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✓ | target 标识；CLI `--target`、dist 目录名、消费方接线均引用此 id |
| `kind` | ✓ | `native-metadata` |
| `description` | | 人工说明 |
| `source.files` | ✓ | 参与反射的 TS 源文件列表（须含 root class 及属性链可达的 class） |
| `roots[].className` | ✓ | 作为 `rootApi` 抽取入口的 class 名 |
| `roots[].kind` | | 可选；与 class JSDoc `@moduleKind` 人工核对 |
| `outputs.distDir` | | VCM dist 根目录；**缺省** = `dirname(outputs.runtime)` |
| `outputs.runtime` | ✓ | 组装后的 monolithic runtime JSON（dev/审计用） |
| `outputs.jsdocTodoLog` | ✓ | JSDoc / schema 待补日志 |

`createVcmTargetGeneratorOptions()` 把 target 映射为 generator 入参：`sources`、`apiRoots`、`moduleRuntimeOutFile`、`distDir`、`targetId` 等。

### 2.3 内置 target 与消费方

| target id | 扫描面 | 典型消费者 |
|-----------|--------|------------|
| `project-model` | 仅 `ProjectModel` | `src/services/project-planning-vcm-knowledge-provider.ts` |
| `project-page-surface` | `ProjectModel` + `ConfigPage` + `DataSetCrudTool` + `SparkNodeTree` | `src/services/page-design/page-design-vcm-knowledge-provider.ts` |

运行时 URL 集中在 `src/vcm/artifact-urls.ts`：

- metadata：**`manifestUrl`** → Worker 按 kind 按需加载 `kinds/*.json` + `$defs.json`
- 回退：主线程 `ClassModelKnowledgeService` 直接 import `*.runtime.ts`
- 组件 props：`componentCatalogOutput` → `vcmComponentCatalogUrl`（与 metadata target 独立）

```text
config/vcm/registry.json
  │
  ├─ generate:module-metadata [--target <id>]
  │     └─ generated/vcm/dist/<id>/
  │           manifest.json / kinds/*.json / $defs.json
  │           vcm-compile-report.json
  │           *-module-metadata.runtime.generated.json
  │
  ├─ generate:component-catalog
  │     └─ generated/vcm/component-catalog.json
  │
  └─ src/vcm/artifact-urls.ts → KnowledgeProvider → Worker vcm_query / guide
```

### 2.4 CLI 命令

| 命令 | 作用 |
|------|------|
| `pnpm run generate:module-metadata` | 编译默认 target `project-page-surface` |
| `pnpm run generate:module-metadata -- --target project-model` | 编译指定 target |
| `pnpm run generate:module-metadata -- --config <file>` | 使用非默认 registry |
| `pnpm run generate:vcm-metadata` | 依次编译 registry 内**全部** target |
| `pnpm run generate:component-catalog` | 生成组件 props catalog |
| `pnpm run diagnose:module-metadata` | 仅诊断，不写 dist |
| `pnpm run generate:module-metadata -- --verify-build-consistency` | 源码反射 vs 构建产物 type-entry 对账 |

**有 error finding 时 CLI 直接失败**；warn 写入 `vcm-compile-report.json`。

### 2.5 配置变更检查表（新增 / 修改 target）

1. 在 `config/vcm/registry.json` 增加或修改 `metadataTargets[]` 条目（`id` 全局唯一）。
2. `source.files` 覆盖新 kind 所在 TS；`roots` 指向正确的 `@moduleKind` 根 class。
3. `outputs.distDir` + `outputs.runtime` 指向 `generated/vcm/dist/<id>/`（**禁止**写入 `config/` 或手改产物）。
4. 运行 `pnpm run generate:vcm-metadata`（或 `--target <id>`），确认 `gates` 全 0。
5. 在 `src/vcm/artifact-urls.ts` 增加 `manifestUrl`（及必要时 `metadataUrl`）。
6. 新建或更新 `*VcmKnowledgeProvider`，传入 `manifestUrl`；主线程回退可 import `*-module-metadata.runtime.ts`。
7. 若该 target 成为门禁主面：更新 `scripts/audit-vcm-build-output.mjs` 中的 dist 路径与期望 kind 列表。
8. `pnpm run verify:vcm-native`（或 `verify:vcm-native:full`）全绿后再合入。

### 2.6 配置与 class 契约的关系

| 配置层 | 源码层 |
|--------|--------|
| `source.files` 列出文件 | 文件内 `@moduleKind` class 进入 metadata |
| `roots[].className` | 该 class 成为 `module.rootApi` |
| `roots[].kind`（可选） | 应与 class JSDoc `@moduleKind` 一致 |
| 属性链 `attributes[].api` | 由 getter 类型 + JSDoc **自动发现**，无需在 registry 逐条声明 |
| `componentCatalogOutput` | Vue 组件 props；**不走** module-metadata 反射 |

改 JSDoc / class 成员 → 重跑 `generate:vcm-metadata`；改扫描面或产物路径 → 改 registry。

## 3. dist 产物（只读）

```text
generated/vcm/dist/<target-id>/
  manifest.json                 # bundle 索引
  $defs.json                    # JSON Schema 池
  kinds/<kind>.json             # 按 @moduleKind 拆分
  vcm-compile-report.json       # 编译报告（门禁真源）
  *-module-metadata.jsdoc-todo.generated.json
  *-module-metadata.runtime.generated.json
  *-module-metadata.runtime.ts
```

## 4. 生命周期契约（措施，不是口号）

三类 kind，编译器 **自动审计**（`vcm-native-class-lifecycle-audit.ts`）：

### 4.1 会话模型 `@vcmSession`（默认：project、config-page）

- **用途**：运行时会话、编排入口，不对应单一 JSON 文件。
- **不要求** `toJson` / `fromJson`。
- **要求**：`@moduleKind` + 公开 action；跨页用 `openPageDesign` 等 action，不用伪造序列化。

```typescript
/**
 * 页面设计项目模型。
 * @moduleKind project
 * @vcmSession 编排会话；无整包 toJson。
 */
export class ProjectModel { ... }
```

### 4.2 快照模型（默认：dataset、data-table、data-view）

- **用途**：对应 `pagedata.json`、表/视图元数据等可持久化 JSON。
- **必须**：
  - 实例 `toJson(): Metadata`
  - 静态工厂之一：`fromJson` | `fromDataSet` | `reconcileFromJson`
- **参考实现**：`DataSetCrudTool`、`DataTable`、`DataView`。

```typescript
/**
 * @moduleKind dataset
 * @vcmSerializable
 */
export class DataSetCrudTool {
  static fromJson(json: DataSetMetadata | Record<string, unknown> | string): DataSetCrudTool { ... }
  toJson(): DataSetMetadata { ... }
}
```

### 4.3 树模型（默认：node-tree）

- **必须**：`static fromJson` 或 `fromRuleJson`
- **建议**：实例 `toJson`；若仅经 `getFileText('rule.json')` 持久化，在 class JSDoc 标注 `@vcmFilePersisted`（说明文件 API 路径），否则编译器 **warn**（`lifecycle-tree-no-toJson`）

类型说明（非强制 implements）：`packages/spark-ai/src/vcm-native/metadata/vcm-native-class-contract.ts`

### 4.4 构造与守卫

| 成员 | 规范 |
|------|------|
| `constructor` | 会话/工具入口；参数须有 JSDoc `@param` |
| `@moduleGuard` | 类级约束（写入 metadata `guards[]`），LLM 可见 |
| `@failureMode` | action 失败恢复；**唯一** recovery 真源。格式 `CODE when => fix`；`when` 须含可与运行时 `msg` 子串匹配的英文 token 或中文片段（recovery 按 `when` 消歧，同 code 多候选时必填） |
| `@vcmIgnore` | 不进入 metadata |

## 5. 发现边 vs 执行边

| 边 | 源码 | metadata |
|----|------|----------|
| 发现 | `get child(): Child` + JSDoc | `attributes[].api` → 子 kind |
| 执行 | `public async doX(...)` | `actions[]` + params/result schema |
| 集合 | `get rows(): Row[]` | `schema.type=array` + `api` 指向元素 kind |

## 6. 编译日志（必须会读）

### 6.1 CLI 标准输出（`module-metadata-cli`）

| 段落 | 含义 |
|------|------|
| `📊 metadata diagnostics` | ability/module/action 计数 |
| `🧾 runtime knowledge audit` | $defs 闭包、死 def |
| `knowledge coverage` | 属性/方法/ schema 描述覆盖率 |
| `🧭 schema semantic todo` | **待补** 命名字段 JSDoc（按 file:line 聚合） |
| `🧭 JSDoc todo build log` | **待补** summary / `@param` |
| `[warn/error] rule target` | 诊断 finding |

### 6.2 `*-jsdoc-todo.generated.json`

人工待办清单；**`gates.jsdocSourceTodoCount > 0` 时门禁失败**。

### 6.3 `vcm-compile-report.json`

```json
{
  "gates": {
    "diagnosticErrorCount": 0,
    "jsdocSourceTodoCount": 0,
    "schemaSourceTodoCount": 0,
    "lifecycleErrorCount": 0
  },
  "coverage": { "attributes": "96/96", ... },
  "findings": []
}
```

CI / 本地以 `gates` 为准，不靠肉眼扫 50 万行 JSON。

## 7. 检验门（必须过）

| 命令 | 作用 |
|------|------|
| `pnpm run generate:module-metadata` | 编译；**有 error finding 直接失败** |
| `pnpm run audit:vcm-build-output` | 产物审计：属性链、$defs、JSDoc todo、compile-report |
| `pnpm run verify:vcm-native` | 生成 + audit + 单测 |
| `pnpm run verify:vcm-native:full` | 跨包 build + `--verify-build-consistency` |
| `pnpm run verify:vcm-full-chain-reconciliation` | 源码→产物→ClassModel→recovery/Worker 全链路对账快照 |
| `pnpm run verify:rules` | 含 `verify:vcm-native`（合入前架构/VCM 总门禁） |

### audit 硬门禁（error）

- `ATTRIBUTE_REACHABLE_KINDS` / 属性链断路
- `MISSING_DEFS`
- `COMPILE_REPORT_*` / `JSDOC_SOURCE_TODOS` / `SCHEMA_SOURCE_TODOS`
- `BUNDLE_MONOLITHIC_MISMATCH` / `BUNDLE_MONOLITHIC_PARITY`（`kinds/*.json` 组装 ≡ monolithic runtime）
- `LEGACY_VCM_OUTPUT_PATH`（禁止 `generated/vcm/<id>/` 无 `dist/` 遗留产物）
- `lifecycle-missing-toJson` / `lifecycle-missing-fromJson`（快照 kind）

### audit 软门禁（warn，待收紧）

- `SIGNATURE_UNKNOWN`、`PARAMS_TYPE_TEXT_MISSING`
- `lifecycle-tree-no-toJson`

## 8. 禁止事项

- 手改 `generated/vcm/dist/**`
- 写入 `generated/vcm/<target-id>/`（无 `dist/` 的遗留路径；audit 报 `LEGACY_VCM_OUTPUT_PATH`）
- 第二知识通道：`diagnostics`/`models` 预存、`returnsKind`、`callbackTargetKind`
- 在 app 层补 recovery 图（只用 `@failureMode`）
- 在 page `script.js` 暴露业务 API

## 9. 新增 kind 检查表

1. class JSDoc：`@moduleKind` + 生命周期标签（`@vcmSession` / `@vcmSerializable` / `@vcmFilePersisted`）
2. 快照 kind：`toJson` + `static fromJson`（或豁免标签）
3. 属性链 getter 指向子 kind
4. action 补 `@failureMode`（若有失败模式）
5. 若新 kind 不在现有 target 扫描面：按 §2.5 更新 `config/vcm/registry.json`
6. `pnpm run generate:vcm-metadata` → `gates` 全 0
7. `pnpm run audit:vcm-build-output` → `ok: true`
8. `pnpm run verify:vcm-full-chain-reconciliation` → `noRegression: true`

## 10. 相关文档

- 配置目录约定：`config/README.md`
- Registry Schema：`config/schemas/vcm.schema.json`
- 生成器细节：`packages/spark-ai/docs/vcm-generator-and-callbackapis-zh-cn.md`
- 注册表真源：`config/vcm/registry.json`
- 配置解析：`packages/vite-plugin-spark-catalog/src/vcm-config.ts`
- 契约类型：`packages/spark-ai/src/vcm-native/metadata/vcm-native-class-contract.ts`
