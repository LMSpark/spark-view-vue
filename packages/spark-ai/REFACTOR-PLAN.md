# spark-ai 分层重构方案

> 创建于 2026-04-24。本文件是实施前的审批文档，实施完成后更新「进度」列。

## 一、问题清单（SOLID + SSoT 视角）

| ID | 原则 | 位置 | 描述 |
|----|------|------|------|
| **D1** | DIP | `session-backend.ts` | 具体传输实现反向依赖高层模块 `session-orchestrator.ts` 获取 `SessionBackend` 接口 |
| **S1** | SRP | `session-orchestrator.ts` | 同时承载：契约类型定义 + 编排循环逻辑 + 终止条件判断 |
| **S2** | SRP | `tool-calling.ts` | 混合：FC 协议类型 + Action 名转换 + Still→JSON Schema 生成 + FC 调度分发 四项职责 |
| **O1** | OCP | `prompt-builder.ts` | `getSystemPrompt()` 用 switch + 联合类型，新增 PromptMode 必须改此文件 |
| **O2** | OCP | `session-orchestrator.ts` | 终止条件硬编码 `DATASET_EXPORT_ACTION` + 蓝图完成检查，新增终止条件须改编排器 |
| **G1** | 测试隔离 | `session-backend.ts` / `page-cache.ts` / `nav-register.ts` | 模块级 `let _xxx = null`，通过函数注入配置，测试间泄漏、无法多实例 |
| **SSoT1** | SSoT | `session-orchestrator.ts` | `SessionBackend` 等契约接口埋在实现文件内，消费方被迫反向依赖 |
| **SSoT2** | SSoT | `src/generate/`（空目录） | 声明了一个不存在的能力层，代码结构与实际能力不符 |
| **N1** | 命名规范 | `stills/TooLs/` | 目录名大小写违反 kebab-case 惯例 |

---

## 二、决策汇总（Q1–Q8）

| Q | 问题 | 决定 |
|---|------|------|
| Q1 | `SessionBackend` 等契约类型归属 | 提取到 `src/session-contracts.ts`（单文件，不建目录） |
| Q2 | `tool-calling.ts` 拆分方式 | → `src/fc-schema.ts`（类型 + 名转换 + Schema 生成） + `src/fc-dispatcher.ts`（调度分发）；FC 协议类型并入 `session-contracts.ts` |
| Q3 | `getSystemPrompt` OCP 修复 | 注册表驱动：`registerPromptMode` + `Map`；`PromptMode` 从联合类型改为 `string`；内置三种模式自注册 |
| Q4 | 编排器终止条件 | 全部迁移到 Monitor：新建 `export-completion-monitor`，编排器只保留 `monitor.shouldAbort()` 统一出口，删除 `DATASET_EXPORT_ACTION` 硬编码 |
| Q5 | 全局可变状态 | `SessionBackendImpl` 改构造函数参数注入；`page-cache` / `nav-register` 改为工厂函数（`createPageCache` / `createNavRegister`），删除模块级 `let` |
| Q6 | 空目录 + 命名 | 删 `src/generate/`；重命名 `stills/TooLs/` → `stills/edit/tools/`（Q6 + Q7 合并） |
| Q7 | `stills/` 内 Edit 域分层 | 建 `stills/edit/` 子目录，9 个 Edit 域文件全部迁入（含 `tools/`） |
| Q8 | VCM 驱动 FC 知识层 | 本次在 `fc-schema.ts` 留 `FcCatalogJson` 接口 + `loadFcCatalog(json?)` 注入点；`inferPropertySchema()` 降为运行时兜底并加 TODO 注释；VCM 集成作独立后续任务 |

---

## 三、文件变动清单

### 3.1 新建

```
src/session-contracts.ts                       ← 契约类型 SSoT
src/fc-schema.ts                               ← 名转换 + Still→JSON Schema + loadFcCatalog 注入点
src/fc-dispatcher.ts                           ← dispatchToolCall / formatToolResultContent
src/runtime/monitors/export-completion-monitor.ts  ← exportCompleted + 蓝图完成逻辑迁移于此
stills/edit/                                   ← 新子目录（聚合 Edit 域）
stills/edit/tools/                             ← 原 TooLs/ 整体搬入
```

### 3.2 移动（路径变更，文件内容不变，仅更新 import）

| 原路径 | 新路径 |
|--------|--------|
| `stills/edit-state.ts` | `stills/edit/edit-state.ts` |
| `stills/edit-model.ts` | `stills/edit/edit-model.ts` |
| `stills/edit-domain.ts` | `stills/edit/edit-domain.ts` |
| `stills/edit-lifecycle-stills.ts` | `stills/edit/edit-lifecycle-stills.ts` |
| `stills/edit-diff-stills.ts` | `stills/edit/edit-diff-stills.ts` |
| `stills/edit-export-stills.ts` | `stills/edit/edit-export-stills.ts` |
| `stills/TooLs/edit-file-stills.ts` | `stills/edit/tools/edit-file-stills.ts` |
| `stills/TooLs/edit-nodeTree-stills.ts` | `stills/edit/tools/edit-nodeTree-stills.ts` |
| `stills/TooLs/edit-dataset-stills.ts` | `stills/edit/tools/edit-dataset-stills.ts` |

### 3.3 删除

```
src/tool-calling.ts        ← 由 fc-schema + fc-dispatcher 替代
src/generate/              ← 空目录（旧页面生成链残留）
stills/TooLs/              ← 整体搬入 stills/edit/tools/
```

### 3.4 内部大改

| 文件 | 改动要点 |
|------|----------|
| `src/session-backend.ts` | 删模块级 `let _getHeaders/_onSseEvent`；改为构造函数 `options?: { getHeaders?, onSseEvent? }`；删 `configureSessionBackend()` 导出 |
| `src/runtime/page-cache.ts` | 改为 `createPageCache(loader: ConfigLoaderRef): PageCacheHandle` 工厂；删模块级 `let _configLoader` |
| `src/runtime/nav-register.ts` | 改为 `createNavRegister(options): NavRegisterHandle` 工厂；删模块级 `let _getNavApiUrl` |
| `src/prompts/prompt-builder.ts` | 注册表驱动：`const _modeRegistry = new Map<string, PromptFactory>()`；`registerPromptMode(mode, factory)`；`getSystemPrompt` 查 Map，未命中 throw；三种内置模式在模块初始化时自注册 |
| `src/runtime/session-orchestrator.ts` | 删 `DATASET_EXPORT_ACTION` import 和硬编码；删 `hasPendingBlueprintWork()`；`exportCompleted` 变量改由 Monitor 通过 `shouldAbort` 的 metadata 回传（或 `OrchestratorResult.exportCompleted` 由 Monitor 标记） |
| `src/runtime/monitors/index.ts` | 追加导出 `createExportCompletionMonitor` |
| `stills/index.ts` | 更新 edit 域全部 import 路径为 `./edit/*` |
| `src/index.ts` | 删 `configureSessionBackend`；`setConfigLoader` → `createPageCache`；`configureNavRegister` → `createNavRegister`；`ToolCall` 等 FC 类型改从 `session-contracts` re-export |

---

## 四、公开 API 变更（`@spark-view/spark-ai` 包边界）

| 符号 | 变化 | 影响方 |
|------|------|--------|
| `configureSessionBackend` | **删除** → 改为 `SessionBackendImpl` 构造参数 | `useRuleEditSession.ts`、`ai-edit-sparknode.e2e.test.ts`、`session-backend-impl.test.ts` |
| `setConfigLoader` | **替换** → `createPageCache(loader)` 返回句柄 | `spark-app/start.ts`、`useTenantRouter.ts` |
| `configureNavRegister` | **替换** → `createNavRegister(options)` 返回句柄 | `src/index.ts` 消费方 |
| `PromptMode` | 联合类型 → `string`（宽化，向后兼容） | `prompt-builder.ts` 消费方 |
| `ToolCall`、`ToolDefinition`、`LlmResponse` 等 FC 类型 | 来源改为 `session-contracts`，re-export 签名不变 | 无感知 |
| 其余全部符号 | 签名不变，内部路径变化 | 无感知 |

---

## 五、外部调用方需同步修改

| 文件 | 当前用法 | 需改为 |
|------|----------|--------|
| `src/views/…/useRuleEditSession.ts` | `configureSessionBackend({ getHeaders })` | `new SessionBackendImpl(baseUrl, { getHeaders })` |
| `src/views/…/usePageModelSessionHost.ts` | `new SessionBackendImpl()` | `new SessionBackendImpl(baseUrl, { getHeaders?, onSseEvent? })` |
| `src/composables/useTenantRouter.ts` | `setConfigLoader(loader)` | `createPageCache(loader)` |
| `packages/spark-app/src/start.ts` | `setConfigLoader(loader)` | `createPageCache(loader)` |
| `tests/ai-edit-sparknode.e2e.test.ts` | `configureSessionBackend(...)` | 构造函数参数 |
| `tests/session-backend-impl.test.ts` | `configureSessionBackend(...)` 测试块 | 更新测试为构造参数 |
| `tests/edit-mode-tool-registry.test.ts` | `from '…/tool-calling'` | `from '…/fc-schema'` |

---

## 六、fc-schema.ts 的 VCM 注入点设计

```typescript
// src/fc-schema.ts（关键接口摘要）

/** VCM 构建期输出的预计算 FC Catalog 格式（SSoT） */
export interface FcCatalogJson {
  version: 1
  tools: Array<{
    action: string
    functionName: string   // actionToFunctionName(action)
    description: string
    schema: JsonSchema     // 预计算好的 JSON Schema
  }>
}

/** 注入预计算 Catalog（由应用启动层调用，VCM 集成后使用） */
export function loadFcCatalog(json: FcCatalogJson): void { ... }

/** 生成 ToolDefinition 列表：有预载 Catalog → 直接读；无 → inferPropertySchema 兜底 */
export function generateToolDefinitions(filter?): ToolDefinition[] { ... }

// TODO(VCM): inferPropertySchema() 在 VCM 集成完成后删除，届时作为 VCM 构建器的工具函数
function inferPropertySchema(raw: string): { prop: JsonSchemaProperty; required: boolean } { ... }
```

---

## 七、目标目录结构

```
packages/spark-ai/src/
  session-contracts.ts          ← NEW: 契约类型 SSoT
  fc-schema.ts                  ← NEW: FC Schema 生成 + VCM 注入点
  fc-dispatcher.ts              ← NEW: FC 调度分发
  protocol-parser.ts            ← 不变
  types.ts                      ← 不变（ProtocolRole/TokenUsage/StreamCallbacks）
  session-backend.ts            ← 改: 构造函数注入
  index.ts                      ← 改: 更新公开 API
  catalog/                      ← 不变
  prompts/
    prompt-builder.ts           ← 改: 注册表驱动
    page-system-prompt.ts       ← 不变
    stills-prompts.ts           ← 不变
    nav-planner-prompt.ts       ← 不变
    edit-flow/                  ← 不变
  runtime/
    session-orchestrator.ts     ← 改: 删硬编码终止条件
    page-cache.ts               ← 改: 工厂函数
    nav-register.ts             ← 改: 工厂函数
    monitors/
      index.ts                  ← 改: 追加导出
      blueprint-orchestration-monitor.ts  ← 不变
      repeat-detection-monitor.ts         ← 不变
      terminal-actions-monitor.ts         ← 不变
      export-completion-monitor.ts        ← NEW
  stills/
    dispatcher.ts               ← 不变
    domain.ts                   ← 不变
    types.ts                    ← 不变
    action-names.ts             ← 不变
    meta-methods.ts             ← 改: import 路径更新
    llm-params-validator.ts     ← 不变
    blueprint-domain.ts         ← 不变
    dataset-crud-tool-stills-catalog.ts  ← 不变
    script-js-tool-catalog.ts   ← 不变
    spark-node-component-catalog.ts      ← 不变
    spark-node-tree-tool-catalog.ts      ← 不变
    style-css-tool-catalog.ts   ← 不变
    index.ts                    ← 改: 路径更新
    edit/                       ← NEW 子目录
      edit-state.ts
      edit-model.ts
      edit-domain.ts
      edit-lifecycle-stills.ts
      edit-diff-stills.ts
      edit-export-stills.ts
      tools/
        edit-file-stills.ts
        edit-nodeTree-stills.ts
        edit-dataset-stills.ts
  validation/                   ← 不变
```

---

## 八、实施顺序

按依赖最小化排序，每步完成后运行 `pnpm run typecheck` 验证：

| 步骤 | 操作 | 验证 |
|------|------|------|
| 1 | 新建 `session-contracts.ts`，从 `session-orchestrator.ts` + `tool-calling.ts` 提取契约类型 | typecheck |
| 2 | 拆 `tool-calling.ts` → `fc-schema.ts` + `fc-dispatcher.ts`，从 `session-contracts` 导入类型 | typecheck |
| 3 | 修 `session-backend.ts`：删模块级 let，改构造函数参数，删 `configureSessionBackend` | typecheck |
| 4 | 修 `page-cache.ts`：`createPageCache()` 工厂 | typecheck |
| 5 | 修 `nav-register.ts`：`createNavRegister()` 工厂 | typecheck |
| 6 | 修 `prompt-builder.ts`：注册表驱动 | typecheck |
| 7 | 新建 `export-completion-monitor.ts`，修 `session-orchestrator.ts` 删硬编码终止 | typecheck |
| 8 | 建 `stills/edit/` + `stills/edit/tools/`，移动 9 个文件，批量更新 import 路径 | typecheck |
| 9 | 修 `stills/index.ts`、`stills/meta-methods.ts` | typecheck |
| 10 | 修 `src/index.ts`（公开 API 更新） | typecheck |
| 11 | 修外部调用方（7 处，见第五节） | typecheck |
| 12 | 删 `src/generate/`（空目录） | typecheck |
| 13 | 全量验证：`pnpm run typecheck && pnpm run lint` | lint + typecheck |

---

## 九、进度跟踪

| 步骤 | 状态 |
|------|------|
| 1. 新建 session-contracts.ts | ✅ 已完成 |
| 2. 拆 tool-calling.ts | ✅ 已完成 |
| 3. 修 session-backend.ts | ✅ 已完成 |
| 4. 修 page-cache.ts | ✅ 已完成 |
| 5. 修 nav-register.ts | ✅ 已完成 |
| 6. 修 prompt-builder.ts | ✅ 已完成 |
| 7. export-completion-monitor + 编排器 | ✅ 已完成 |
| 8. stills/edit/ 目录迁移 | ✅ 已完成 |
| 9. 修 stills/index.ts + meta-methods.ts | ✅ 已完成 |
| 10. 修 src/index.ts | ✅ 已完成 |
| 11. 修外部调用方 | ✅ 已完成 |
| 12. 删 src/generate/ | ✅ 已完成 |
| 13. 全量 typecheck + lint | ✅ 已完成 |
