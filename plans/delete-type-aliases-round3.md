# 方案：全仓删除类型别名（第三轮扩展）

> 第一轮 34 个（`plans/delete-type-aliases.md`）
> 第二轮 8 个（`plans/delete-type-aliases-round2.md`）
> 本轮新增 **9 个**，按功能/流程/时序分组重新排版。

---

## 任务目标

清理全仓中剩余的可消除类型别名——空接口、纯转发别名、死代码、仅内部使用的导出类型。

---

## L 簇：空接口影子（1 个）

> interface 继承父接口但未添加任何新成员。

### L-1: `PageDesignServiceState`

| 属性 | 值 |
|------|---|
| 定义 | `packages/spark-page-config/src/page/workspace/services/page-design-service-contract.ts:15` |
| 定义内容 | `export interface PageDesignServiceState extends PageDesignEditSession {}` |
| 引用方（5 处） | `page-design-service.ts:19,35,183` + `workspace/index.ts:176` |
| 替换为 | `PageDesignEditSession` |

**分析**：空接口，完全等价于 `PageDesignEditSession`。无新增成员，无任何类型收窄或扩展。属于历史遗留的"语义标签"类型。

---

## M 簇：纯转发别名（1 个）

> `type X = Y`，X 和 Y 是不同名称但完全等价。

### M-1: `DataViewMemberResolvedValue`

| 属性 | 值 |
|------|---|
| 定义 | `packages/spark-data/src/core/data-view-key.ts:85` |
| 定义内容 | `export type DataViewMemberResolvedValue = DataViewMemberValue` |
| 引用方（4 处） | `data-view-key.ts:185,250` + `spark-data/src/index.ts:68` |
| 替换为 | `DataViewMemberValue` |

**分析**：纯转发别名。注释"这里不再为 JS 基础类型保留导出别名"已存在，此别名是漏网之鱼。

---

## N 簇：死代码类型（5 个）

> 定义后无任何 import 作为类型注解使用，仅被 re-export 导出。

| 删除类型 | 文件 | 值域 | 说明 |
|----------|------|------|------|
| `PageDataEditorMode` | `page-data-json-schema.ts:11` | `'tree' \| 'text' \| 'table'` | 仅定义 + re-export，无类型消费方 |
| `TextModelFunctionFileKey` | `text-model-tool-catalog.ts:20` | `'script' \| 'style'` | 仅定义 + re-export 链，无类型消费方 |
| `TextModelFunctionId` | `text-model-tool-catalog.ts:21` | 4 值联合 | 同上，同文件注释已说明"函数标识符直接使用原生 string" |
| `EditLifecycleFunctionId` | `lifecycle-tool-catalog.ts:21` | 3 值联合 | 同上 |
| `SparkNodeTreeToolFunctionId` | `node-tree-tool-catalog.ts:29` | 22 值联合 | 同上，函数 ID 已硬编码为字符串常量 |

**删除动作**：
1. 删除各文件中的类型定义行
2. 从 `workspace/index.ts`、`page-design/index.ts`、`assistant/registrations/index.ts` 中删除对应的 re-export

---

## O 簇：仅内部使用的导出类型（1 个）

> export 关键字无效——无外部消费者。

### O-1: `FieldActionMode`

| 属性 | 值 |
|------|---|
| 定义 | `packages/spark-component/src/components/fields/actions/useFieldActionMode.ts:4` |
| 定义内容 | `export type FieldActionMode = 'editable' \| 'readonly'` |
| 引用方（3 处） | 仅同文件 `useFieldActionMode.ts:11,16` |
| 处理 | 去掉 `export`，保留为内部类型 |

**分析**：export 从未被外部 import，仅在定义文件内部使用。改为非导出类型，减少公共 API 面。

---

## P 簇：窄范围联合（1 个）

> 简单字符串联合，仅 1-2 处使用。

### P-1: `NavNodeRouteTargetKind`

| 属性 | 值 |
|------|---|
| 定义 | `packages/spark-app/src/navigation/runtime-target.ts:3` |
| 定义内容 | `export type NavNodeRouteTargetKind = 'page' \| 'external-link' \| 'cross-project-ref'` |
| 引用方（3 处） | `runtime-target.ts:7`（属性类型）+ `spark-app/src/index.ts`（re-export） |
| 替换为 | 内联到 `routeKind` 属性类型 |

**分析**：三值联合，仅 1 处实际使用（`NavNodeRouteTarget.routeKind` 属性类型）。删除后内联到属性声明。

---

## 排除项说明

| 类型 | 原因 |
|------|------|
| `PageFileName` | 55 处引用、9 文件，改动面过大，本次不处理 |
| `SparkNodeTreeRuleJsonInput` | 5 处引用，语义清晰（rule.json 反序列化输入），保留 |

---

## 汇总改动文件清单

| 包 | 文件 | 改动类型 |
|---|------|----------|
| spark-page-config | `src/page/workspace/services/page-design-service-contract.ts` | 删除 `PageDesignServiceState` |
| spark-page-config | `src/page/workspace/services/page-design-service.ts` | `PageDesignServiceState` → `PageDesignEditSession` |
| spark-page-config | `src/page/workspace/index.ts` | 删除 `PageDesignServiceState`、`PageDataEditorMode` re-export |
| spark-data | `src/core/data-view-key.ts` | `DataViewMemberResolvedValue` → `DataViewMemberValue` |
| spark-data | `src/index.ts` | 删除 `DataViewMemberResolvedValue` re-export |
| spark-page-config | `src/page/workspace/design/page-data-json-schema.ts` | 删除 `PageDataEditorMode` |
| spark-page-config | `src/assistant/registrations/page-design/modules/text-model-tool-catalog.ts` | 删除 `TextModelFunctionFileKey`、`TextModelFunctionId` |
| spark-page-config | `src/assistant/registrations/page-design/modules/lifecycle-tool-catalog.ts` | 删除 `EditLifecycleFunctionId` |
| spark-page-config | `src/assistant/registrations/page-design/modules/node-tree-tool-catalog.ts` | 删除 `SparkNodeTreeToolFunctionId` |
| spark-page-config | `src/assistant/registrations/page-design/index.ts` | 删除 4 个死代码 re-export |
| spark-page-config | `src/assistant/registrations/index.ts` | 删除 4 个死代码 re-export |
| spark-component | `src/components/fields/actions/useFieldActionMode.ts` | `FieldActionMode` 去掉 export |
| spark-app | `src/navigation/runtime-target.ts` | 删除 `NavNodeRouteTargetKind`，内联到属性 |
| spark-app | `src/index.ts` | 删除 `NavNodeRouteTargetKind` re-export |

---

## 技术方案

### 实现步骤

1. **L 簇（空接口）** — 3 文件
   - 删除 `PageDesignServiceState` 接口定义
   - `page-design-service.ts` 中 3 处引用改为 `PageDesignEditSession`
   - `workspace/index.ts` 中删除 re-export

2. **M 簇（纯转发）** — 2 文件
   - `data-view-key.ts` 中 2 处 `DataViewMemberResolvedValue` → `DataViewMemberValue`
   - 删除类型定义行
   - `spark-data/src/index.ts` 删除 re-export

3. **N 簇（死代码）** — 6 文件
   - 删除 5 个死代码类型定义
   - 清理 3 条 re-export 链（workspace/index.ts → page-design/index.ts → assistant/registrations/index.ts）

4. **O 簇（降级非导出）** — 1 文件
   - `FieldActionMode` 去掉 `export` 关键字

5. **P 簇（窄联合）** — 2 文件
   - `runtime-target.ts` 中删除 `NavNodeRouteTargetKind` 定义
   - `routeKind` 属性类型改为内联 `'page' | 'external-link' | 'cross-project-ref'`
   - `spark-app/src/index.ts` 删除 re-export

### 关键设计决策

- **N 簇全部删除不复用**：这些 FunctionId 类型从未被任何类型注解使用，函数 ID 已硬编码为字符串常量（如 `TEXT_MODEL_FUNCTIONS`、`NODE_TREE_FUNCTIONS`）。删除后不影响运行时行为。
- **O 簇仅降级不删除**：`FieldActionMode` 在同文件内有 2 处使用，保留为内部类型即可。

## 兼容性

- **破坏性变更**：
  - `PageDesignServiceState` 不再可用，改用 `PageDesignEditSession`
  - `DataViewMemberResolvedValue` 不再可用，改用 `DataViewMemberValue`
  - `PageDataEditorMode`、`TextModelFunctionFileKey`、`TextModelFunctionId`、`EditLifecycleFunctionId`、`SparkNodeTreeToolFunctionId` 不再导出（均为死代码，无消费方）
  - `NavNodeRouteTargetKind` 不再导出，改用内联联合类型
  - `FieldActionMode` 不再公开导出
- **API 行为无变化**：纯类型层改动，无运行时行为变更。

## 验证计划

- `pnpm --filter @spark-view/spark-data run typecheck`
- `pnpm --filter @spark-view/spark-page-config run typecheck`
- `pnpm --filter @spark-view/spark-component run typecheck`
- `pnpm --filter @spark-app run typecheck`（如有）
- `pnpm run typecheck`（全仓）

## 风险项

| 风险 | 缓解措施 |
|------|----------|
| N 簇 FunctionId 类型可能有外部 LLM 提示依赖 | 搜索确认：仅 re-export 链引用，无外部 import；LLM 消费的是字符串值，不消费 TS 类型名 |
| `PageFileName` 排除可能导致不一致 | 已在方案中明确说明：55 处引用改动面过大，后续可单独处理 |
