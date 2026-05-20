# 方案：全仓删除类型别名

## 任务目标

删除全仓 34 个可消除的类型别名（转发别名、Omit 别名、内联 InScript 类型），调用方改为直接使用源类型或内联写法。

## 影响范围

### A 簇：纯转发别名（11 个）— `script-context-types.ts`

| 删除类型 | 替换为 | 改动文件 |
|----------|--------|----------|
| `PageServiceInScript` | `PageServiceCapability` | script-context-types.ts, sandbox/index.ts |
| `PageDialogResultInScript` | `PageDialogResult` | sandbox/index.ts |
| `PageDialogOptionsInScript` | `PageDialogOptions` | sandbox/index.ts |
| `PageSelectableValueInScript` | `PageSelectableValue` | sandbox/index.ts |
| `PageSelectorOptionInScript` | `PageSelectorOption` | sandbox/index.ts |
| `PageSelectEntitiesOptionsInScript` | `PageSelectEntitiesOptions` | sandbox/index.ts |
| `PageSelectedEntityInScript` | `PageSelectedEntity` | sandbox/index.ts |
| `PageBrowseFilesOptionsInScript` | `PageBrowseFilesOptions` | sandbox/index.ts |
| `PageSelectedFileInScript` | `PageSelectedFile` | sandbox/index.ts |
| `PageUploadFilesOptionsInScript` | `PageUploadFilesOptions` | sandbox/index.ts |
| `PageUploadedFileInScript` | `PageUploadedFile` | sandbox/index.ts |

其中仅 `PageServiceInScript` 在 `ScriptContext` 内部被引用（:139），其余 10 个仅通过 `sandbox/index.ts` barrel 导出。

### B 簇：内联对象类型（5 个）— `script-context-types.ts`

| 删除类型 | 处理方式 | 改动文件 |
|----------|----------|----------|
| `PermissionActionContextInScript` | 内联到 `PermissionApiInScript.isPermittedAction` 的参数类型 | script-context-types.ts |
| `FieldRenderConfigInScript` | 内联到 `PermissionApiInScript` 的 2 处引用 | script-context-types.ts |
| `FieldRenderStateInScript` | 内联到 `PermissionApiInScript` 的 2 处返回类型 | script-context-types.ts |
| `PageComponentInstanceInScript` | 内联到 `PageComponentAccessInScript` 的 3 处引用 | script-context-types.ts |
| `ModuleContextItemInScript` | 内联到 `ModuleContextInScript.items` 的类型 | script-context-types.ts |

**注意**：`ModuleContextInScript` 本身不是别名（是内联对象定义），保留。仅删除 `ModuleContextItemInScript` 别名并内联其结构到 `ModuleContextInScript.items`。

`PermissionApiInScript` 本身也是内联对象定义（不是别名），保留。

### C 簇：FailureMode 转发（5 个）

| 删除类型 | 替换为 | 改动文件 |
|----------|--------|----------|
| `AiKnowledgeFunctionFailureMode` | `FunctionFailureMode` | knowledge-tool-catalog.ts, protocol/index.ts |
| `TextModelFunctionFailureMode` | `FunctionFailureMode` | text-model-tool-catalog.ts, registrations/page-design/index.ts, registrations/index.ts |
| `SparkNodeTreeToolFailureMode` | `FunctionFailureMode` | node-tree-tool-catalog.ts, registrations/page-design/index.ts, registrations/index.ts |
| `EditLifecycleFunctionFailureMode` | `FunctionFailureMode` | lifecycle-tool-catalog.ts, registrations/page-design/index.ts, registrations/index.ts |
| `DatasetCrudToolFunctionFailureMode` | `FunctionFailureMode` | dataset-tool-catalog.ts, registrations/page-design/index.ts, registrations/index.ts |

### D 簇：Control 转发（4 个）

| 删除类型 | 替换为 | 改动文件 |
|----------|--------|----------|
| `InteractionControl` | `CancellableControl` | interactionControl.ts, useEventDefaults.ts, support/index.ts, action-types.ts (import), tests, SkillCatalog.vue |
| `TreeEventControl` | `CancellableControl` | zero-code.ts |
| `FieldChangeControl` | `CancellableControl` | useControlledFieldChange.ts |
| `ActionExecutionControl` | `CancellableControl` | action-types.ts, action-executor.ts, bind-normalize.ts, actions/index.ts |

### E 簇：Omit 别名（9 个）— `runtime-protocol.ts`

| 删除类型 | 替换为 | 改动文件 |
|----------|--------|----------|
| `AiRegisteredModuleStartSessionOptions` | `Omit<AiRuntimeStartSessionOptions, 'moduleId'>` | runtime-protocol.ts, ai-registered-module.ts |
| `AiRegisteredModuleStopSessionOptions` | `Omit<AiRuntimeStopSessionOptions, 'moduleId'>` | 同上 |
| `AiRegisteredModuleProjectKnowledgeOptions` | `Omit<AiRuntimeProjectKnowledgeOptions, 'moduleId'>` | 同上 |
| `AiRegisteredModuleAppendMessageOptions` | `Omit<AiRuntimeAppendMessageOptions, 'moduleId'>` | 同上 |
| `AiRegisteredModuleAppendFunctionCallOptions` | `Omit<AiRuntimeAppendFunctionCallOptions, 'moduleId'>` | 同上 |
| `AiRegisteredModuleRecordFunctionCallRequestOptions` | `Omit<AiRuntimeRecordFunctionCallRequestOptions, 'moduleId'>` | 同上 |
| `AiRegisteredModuleCompleteFunctionCallOptions` | `Omit<AiRuntimeCompleteFunctionCallOptions, 'moduleId'>` | 同上 |
| `AiRegisteredModuleTranslateFunctionCallOptions` | `Omit<AiRuntimeTranslateFunctionCallOptions, 'moduleId'>` | 同上 |
| `AiRegisteredModuleExecuteFunctionCallOptions` | `Omit<AiRuntimeExecuteFunctionCallOptions, 'moduleId'>` | 同上 |

### 汇总改动文件清单（共 21 个文件）

| 包 | 文件 |
|---|------|
| spark-page-config | `src/page/sandbox/script-context-types.ts` |
| spark-page-config | `src/page/sandbox/index.ts` |
| spark-page-config | `src/assistant/registrations/page-design/index.ts` |
| spark-page-config | `src/assistant/registrations/page-design/modules/text-model-tool-catalog.ts` |
| spark-page-config | `src/assistant/registrations/page-design/modules/node-tree-tool-catalog.ts` |
| spark-page-config | `src/assistant/registrations/page-design/modules/lifecycle-tool-catalog.ts` |
| spark-page-config | `src/assistant/registrations/page-design/modules/dataset-tool-catalog.ts` |
| spark-page-config | `src/assistant/registrations/index.ts` |
| spark-ai | `src/internal/knowledge/knowledge-tool-catalog.ts` |
| spark-ai | `src/protocol/index.ts` |
| spark-ai | `src/protocol/runtime-protocol.ts` |
| spark-ai | `src/internal/runtime/ai-registered-module.ts` |
| spark-component | `src/components/containers/support/interactionControl.ts` |
| spark-component | `src/components/containers/support/useEventDefaults.ts` |
| spark-component | `src/components/containers/support/index.ts` |
| spark-component | `src/components/containers/data-views/RendererTree/zero-code.ts` |
| spark-component | `src/components/fields/data-components/composables/useControlledFieldChange.ts` |
| spark-component | `src/page/actions/action-types.ts` |
| spark-component | `src/page/actions/action-executor.ts` |
| spark-component | `src/page/actions/index.ts` |
| spark-component | `src/page/binding/bind-normalize.ts` |
| 应用层 | `src/views/app/SkillCatalog.vue` |
| 测试 | `tests/use-event-defaults.test.ts` |
| 测试 | `tests/zero-code-events.test.ts` |
| 测试 | `tests/field-time-autocomplete.test.ts` |

## 技术方案

### 实现步骤

1. **E 簇（Omit 别名）** — 2 文件，改动最小
   - 删除 `runtime-protocol.ts` 中 9 行 `export type AiRegisteredModule*Options` 定义
   - 在 `ai-registered-module.ts` 中将所有类型引用改为 `Omit<..., 'moduleId'>` 内联写法

2. **C 簇（FailureMode）** — 7 文件
   - 删除 5 个 `type X = FunctionFailureMode` 别名定义
   - 所有消费方改用 `FunctionFailureMode`
   - 从 `protocol/index.ts` 删除 `AiKnowledgeFunctionFailureMode` 导出

3. **A 簇（InScript 纯转发）** — 2 文件
   - 删除 `script-context-types.ts` 中 11 行转发别名
   - `ScriptContext.$page` 类型改为 `PageServiceCapability`
   - 从 `sandbox/index.ts` 删除对应 11 个导出

4. **B 簇（InScript 内联对象）** — 1 文件
   - 删除 `PermissionActionContextInScript`，将其结构内联到 `PermissionApiInScript.isPermittedAction` 参数
   - 删除 `FieldRenderConfigInScript`，内联到 2 处引用
   - 删除 `FieldRenderStateInScript`，内联到 2 处返回类型
   - 删除 `PageComponentInstanceInScript`，内联到 `PageComponentAccessInScript` 的 3 处引用
   - 删除 `ModuleContextItemInScript`，内联到 `ModuleContextInScript.items`

5. **D 簇（Control）** — 10+ 文件
   - 删除 `InteractionControl`、`TreeEventControl`、`FieldChangeControl`、`ActionExecutionControl` 定义
   - 所有消费方改用 `CancellableControl`
   - 更新 barrel 导出、测试文件、SkillCatalog.vue 中的类型引用

### 关键设计决策

- **B 簇选择内联而非引入外部类型**：`ModuleContextItemInScript` 等类型原本定义在 `script-context-types.ts` 是为了避免对 `spark-component` 产生依赖（spark-page-config 不依赖 spark-component）。删除后选择内联对象结构到使用处，而非添加跨包导入。
- **E 簇不创建私有 helper 类型**：直接写 `Omit<..., 'moduleId'>`，调用方读起来一目了然。

## 兼容性

- **破坏性变更**：所有被删除的类型别名不再从原入口导出。外部消费方需改用源类型名：
  - `*InScript` → 原始服务类型名（如 `PageServiceCapability`）
  - `*FailureMode` → `FunctionFailureMode`
  - `*Control` → `CancellableControl`
  - `AiRegisteredModule*Options` → `Omit<AiRuntime*Options, 'moduleId'>`
- **API 行为无变化**：纯类型层面改动，无运行时行为变更。
- **SkillCatalog.vue** 中展示的 `InteractionControl` 类型名需更新为 `CancellableControl`。

## 验证计划

- 类型检查：`pnpm run typecheck`（全仓）
- 各包 typecheck：
  - `pnpm --filter @spark-view/spark-ai run typecheck`
  - `pnpm --filter @spark-view/spark-page-config run typecheck`
  - `pnpm --filter @spark-view/spark-component run typecheck`
- Lint 检查：`pnpm run lint`
- 测试：`pnpm --filter @spark-view/spark-component run test:run`（Control 相关测试）
- 人工验证：确认 SkillCatalog.vue 页面渲染正常，类型展示正确

## 风险项

| 风险 | 缓解措施 |
|------|----------|
| 外部消费方依赖被删除的类型别名 | 这些类型均为内部转发别名，删除后可通过源类型名替代；如有外部消费者，需通知其迁移 |
| B 簇内联后 `PermissionApiInScript` 对象体型变大 | 可接受：该类型本身就是沙箱契约的一部分，内联后结构更紧凑 |
| `InteractionControl` 在测试和 SkillCatalog.vue 中大量使用 | 全局替换 `InteractionControl` → `CancellableControl` 即可，无逻辑变更 |
| E 簇 `Omit<..., 'moduleId'>` 写法比别名名更长 | 可接受：语义清晰，且消除了中间层别名 |
