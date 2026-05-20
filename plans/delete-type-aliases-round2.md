# 方案：全仓删除类型别名（第二轮扩展）

> 第一轮方案见 `plans/delete-type-aliases.md`，覆盖 34 个别名。
> 本轮在第一轮基础上扩展，新增 **8 个**可删除/降级类型别名，按功能/流程/时序分组重新排版。

## 任务目标

继续清理全仓中剩余的可消除类型别名——空接口影子、内部 branded type、组件枚举联合、LlmJsonSchema 转发等。

---

## F 簇：空接口影子（2 个）

> 这些 interface 继承自父接口但未添加任何成员，属于"影子类型"。

### F-1: `SparkCapabilityContext` — spark-component 能力上下文影子

```
文件: packages/spark-component/src/core/capability-keys.ts:24
定义: export interface SparkCapabilityContext extends CapabilityContext {}
使用方: capability-keys.ts (仅定义处)
```

**分析**：空接口，未添加任何成员。`CapabilityContext` 来自 `@spark-view/spark-utils`，spark-component 重新导出时加了同名空接口。调用方（如有）直接使用 `CapabilityContext` 即可。

**处理**：删除 `SparkCapabilityContext`，从 `types.ts` 的 `export type { CapabilityContext }` 中去掉（如有）。

### F-2: `LlmParameterSchemaRoot` — 参数 Schema 根影子

```
文件: packages/spark-ai/src/protocol/parameter-schema.ts:85
定义: export interface LlmParameterSchemaRoot extends LlmJsonSchemaObject {}
使用方:
  - parameter-schema.ts (定义)
  - business-registration.ts: AiFunctionRegistration.paramsSchema
  - knowledge-tool-catalog.ts: AiKnowledgeFunctionParameterRow.paramsSchema
  - runtime-protocol.ts: AiRuntimeFunctionExposure.paramsSchema
  - protocol/index.ts (导出)
```

**分析**：空接口，完全等价于 `LlmJsonSchemaObject`。语义上是"函数参数/结果 schema 的根节点"，但结构上与 schema 节点完全相同。删除后调用方改用 `LlmJsonSchemaObject`，语义从类型名迁移到字段上下文（`paramsSchema`、`resultSchema` 等字段名本身已表达了"根"的含义）。

**处理**：删除接口定义，所有 `LlmParameterSchemaRoot` 替换为 `LlmJsonSchemaObject`。

---

## G 簇：内部 branded type（2 个）

> 这些类型是窄范围的字符串字面量，仅在单个模块内部使用，属于"内部常量类型化"。

### G-1: `AiKnowledgeFunctionTarget`

```
文件: packages/spark-ai/src/internal/knowledge/knowledge-tool-catalog.ts:6
定义: export type AiKnowledgeFunctionTarget = 'knowledge'
使用方:
  - knowledge-tool-catalog.ts:33 (AiKnowledgeFunctionParameterRow.target)
  - knowledge-tool-catalog.ts:41 (KNOWLEDGE_TARGET 常量类型标注)
  - protocol/index.ts (导出)
```

**分析**：单值字面量类型，仅在 knowledge-tool-catalog.ts 内部使用。`AiKnowledgeFunctionParameterRow.target` 字段可内联 `'knowledge'` 字面量。

**处理**：删除类型定义，`target` 字段类型改为字面量 `'knowledge'`，`KNOWLEDGE_TARGET` 常量去掉类型标注（类型推断即可）。从 protocol/index.ts 删除导出。

### G-2: `AiKnowledgeFunctionId`

```
文件: packages/spark-ai/src/internal/knowledge/knowledge-tool-catalog.ts:7-11
定义: export type AiKnowledgeFunctionId = 'queryFunctions' | 'queryModules' | 'guideFunction'
使用方:
  - knowledge-tool-catalog.ts:13 (AiKnowledgeFunctionBaseFields.functionId)
```

**分析**：三值字面量联合，仅在同一文件的 `AiKnowledgeFunctionBaseFields.functionId` 中使用。可直接内联。

**处理**：删除类型定义，`functionId` 字段类型改为内联 `'queryFunctions' | 'queryModules' | 'guideFunction'`。从 protocol/index.ts 删除导出。

---

## H 簇：死代码（1 个）

> 定义后无任何引用，属于残留的类型定义。

### H-1: `PermissionDeniedBehavior`

```
文件: packages/spark-component/src/components/containers/support/RendererActions.types.ts:17
定义: export type PermissionDeniedBehavior = 'hide' | 'disable'
使用方: 无（仅定义处）
```

**分析**：定义后从未被任何文件 import 或使用，属于死代码。`SparkNodeProps.permissionDeniedMode` 中直接写了 `'disable' | 'hide'`，未引用此类型。

**处理**：直接删除类型定义行。

---

## J 簇：LlmJsonValue 降级（1 个）

### J-1: `LlmJsonValue`

```
文件: packages/spark-ai/src/protocol/parameter-schema.ts:22-28
定义: export type LlmJsonValue = string | number | boolean | null | readonly LlmJsonValue[] | LlmJsonObject
使用方:
  - parameter-schema.ts:27 (递归引用)
  - parameter-schema.ts:66 (default 字段)
  - parameter-schema.ts:67 (examples 字段)
  - 仅 parameter-schema.ts 内部使用
```

**分析**：这是一个被 JSON Schema 节点内部引用的递归联合类型。虽然使用了 export，但实际仅 parameter-schema.ts 内部消费。可改为非导出类型。

**处理**：去掉 export，改为内部类型。

---

## K 簇：spark-data 内部别名（1 个）

### K-1: `RecommendedTableResourceType` / `RecommendedTableBusinessCategory`

```
文件: packages/spark-data/src/types.ts:553-559, 585-588
定义: type RecommendedTableResourceType = 'database-table' | 'database-view' | ...
      type RecommendedTableBusinessCategory = 'master' | 'child' | 'reference'
使用方:
  - types.ts:561 (TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES 常量类型)
  - types.ts:570-572 (TableResourceType 联合引用)
  - types.ts:590 (TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES)
  - types.ts:596-598 (TableBusinessCategory 联合引用)
```

**分析**：这是两个不导出的内部类型（无 export），被同文件的推荐值常量和公共联合类型引用。结构合理，不属于要删除的转发别名。

**处理**：保留。

---

## 汇总改动文件清单（第二轮）

| 包 | 文件 | 改动类型 |
|---|------|----------|
| spark-component | `src/core/capability-keys.ts` | 删除 `SparkCapabilityContext` |
| spark-ai | `src/protocol/parameter-schema.ts` | 删除 `LlmParameterSchemaRoot`，`LlmJsonValue` 改非导出 |
| spark-ai | `src/protocol/business-registration.ts` | `AiFunctionRegistration.paramsSchema` 类型更新 |
| spark-ai | `src/internal/knowledge/knowledge-tool-catalog.ts` | 删除 G 簇 2 个别名 |
| spark-ai | `src/protocol/index.ts` | 删除 `AiKnowledgeFunctionId`、`AiKnowledgeFunctionTarget`、`AiKnowledgeFunctionFailureMode` 导出 |
| spark-ai | `src/protocol/runtime-protocol.ts` | `AiRuntimeFunctionExposure.paramsSchema` 类型更新 |
| spark-component | `src/components/containers/support/RendererActions.types.ts` | 删除 H 簇 `PermissionDeniedBehavior` |

---

## 技术方案

### 实现步骤

1. **F 簇（空接口影子）** — 2 文件
   - 删除 `SparkCapabilityContext`，从 capability-keys.ts 中清理
   - 删除 `LlmParameterSchemaRoot`，所有引用改为 `LlmJsonSchemaObject`

2. **G 簇（内部 branded type）** — 2 文件
   - 删除 `AiKnowledgeFunctionTarget`，`target` 字段改为字面量 `'knowledge'`
   - 删除 `AiKnowledgeFunctionId`，`functionId` 字段内联合类型
   - 从 protocol/index.ts 删除这两个导出

3. **H 簇（死代码）** — 1 文件
   - 删除 `PermissionDeniedBehavior`（定义后无任何引用）

4. **J 簇降级** — 1 文件
   - `LlmJsonValue` 改为非导出类型（去掉 export），仅 parameter-schema.ts 内部使用

## 兼容性

- **破坏性变更**：
  - `SparkCapabilityContext` 不再可用，调用方改用 `CapabilityContext`
  - `LlmParameterSchemaRoot` 不再可用，调用方改用 `LlmJsonSchemaObject`
  - `AiKnowledgeFunctionId`、`AiKnowledgeFunctionTarget` 不再从 protocol/index.ts 导出
  - `LlmJsonValue` 不再公开导出（仅 spark-ai 包内部可用）
  - `PermissionDeniedBehavior` 不再可用（无调用方，无影响）
- **API 行为无变化**：纯类型层改动。

## 验证计划

- `pnpm --filter @spark-view/spark-ai run typecheck`
- `pnpm --filter @spark-view/spark-page-config run typecheck`
- `pnpm --filter @spark-view/spark-component run typecheck`
- `pnpm run typecheck`（全仓）

## 风险项

| 风险 | 缓解措施 |
|------|----------|
| `LlmParameterSchemaRoot` 的语义丢失 | 字段名 `paramsSchema` / `resultSchema` 已表达"根"含义，类型名不再需要 |
| `LlmJsonValue` 降级后外部包无法访问 | 全仓搜索确认仅 spark-ai 内部引用，无 spark-page-config / spark-component 导入 |
