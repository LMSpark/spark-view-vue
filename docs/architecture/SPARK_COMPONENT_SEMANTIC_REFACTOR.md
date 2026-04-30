# spark-component 语义层架构分析与精简方向

> 范围：[packages/spark-component/](../../packages/spark-component/)
> 目的：基于 2026-04-30 当前代码现状，系统性识别**语义重复 / 概念冗余 / 命名不一致 / 分类模糊**问题，给出按优先级排序的可执行精简清单。
> 原则：本文聚焦“语义层”而非“实现层”——只在概念重复或边界不清时建议合并/下沉/重命名，不追求美学重构。

---

## 1. 架构理念回顾

spark-component 是 SPARK 体系的**渲染层**。它的核心理念可以归纳为三条：

1. **Config-first 渲染管线**：`rule.json` → `bindRules` → `SparkNode` 树 → `SparkComponentRenderer` 递归 → Vue 组件。
2. **DataView-first 容器**：所有数据容器（`r-table` / `r-form` / `r-detail` / `r-tree`）通过 [`DataKey`](../../packages/spark-data/src/core/data-key.ts) 解析 [`DataView`](../../packages/spark-data/src/data-view.ts)，并通过 `DATA_SOURCE` capability 向后代提供；行级容器再以 `DATA_ROW` 提供当前行镜像。
3. **Capability DI（非 Vue DI）**：业务能力通过 `sparkProvide` / `sparkConsume` 流动；Vue `provide/inject` 只承载基础设施（registry / 全局服务）。

包内存在四类“真源”概念：

| 真源 | 角色 | 入口文件 |
|---|---|---|
| `SparkNode` | 配置语法树（type/props/children） | [core/types.ts](../../packages/spark-component/src/core/types.ts) |
| `DataView` | 数据空间视图 | `@spark-view/spark-data` |
| `Capability` | 能力 DI（PAGE_DATASET / DATA_ROW / DATA_SOURCE / PAGE_SERVICE / PAGE_PERMISSION_MODE …） | [core/capability-system.ts](../../packages/spark-component/src/core/capability-system.ts) |
| `ActionDescriptor` / `BuiltinAction` | 声明式动作 | [page/actions/](../../packages/spark-component/src/page/actions/) + [components/containers/support/actions/](../../packages/spark-component/src/components/containers/support/actions/) |

下文 §2-§5 围绕这四类真源逐一分析；§6 汇总精简方案。

---

## 2. 模块划分与职责

### 2.1 顶层目录现状

```
src/
├── system/                       # ✅ Spark 注册器、插件
├── core/                         # ✅ SparkNode、capability、useSparkComponent、SparkNodeTree
├── page/                         # ✅ 页面渲染（renderer / binding / context / services / sandbox / actions）
├── permission/                   # ⚠️ Checker + Resolver + page-permission-mode（双权限决策器）
├── components/
│   ├── SparkComponentRenderer.vue
│   ├── containers/
│   │   ├── data-components/      # ✅ r-table / r-form / r-detail / r-tree / r-list
│   │   ├── non-data-components/  # ✅ r-button / r-toolbar / r-card / r-dialog…
│   │   ├── support/              # ⚠️ actions/ + scopes + crud helpers 混合
│   │   ├── layout/               # ⚠️ 仅 composables，命名误导
│   │   ├── composables/          # ✅ useContainerDataSource / useFormDetailContainer
│   │   ├── RendererFilter.vue    # ❓ 顶层（应入 data-components）
│   │   ├── RendererHeader/Footer/Tail.vue   # ❓ 结构节点
│   │   └── RendererEditor.vue    # ❓ 编辑区域
│   ├── display/                  # ✅ 静态展示
│   ├── fields/                   # ✅ 输入控件
│   └── support/                  # ⚠️ 渲染时序 + AI 面板 + JSON 编辑器 混合
├── composables/                  # ⚠️ 全部为 AI 相关（与渲染无关）
└── internal/                     # ✅ capability-context 等
```

### 2.2 三类“support”混淆

包内同时存在三个名为 `support` 的目录：

1. [components/support/](../../packages/spark-component/src/components/support/) — 渲染时序工具（`beforeRender.ts`）+ AI 面板 + JsonTreeEditor。
2. [components/containers/support/](../../packages/spark-component/src/components/containers/support/) — 容器执行层（actions、CRUD、HostScope、FieldScope）。
3. （历史上还有过的）AI Sender helpers。

**问题**：`support` 是“无家可归”的兜底分类，对外查找成本高；进入它需要二次判断子目录意图。

### 2.3 layout/ 名实不符

[components/containers/layout/](../../packages/spark-component/src/components/containers/layout/) 仅包含 `useContainerGrid.ts` / `useCompositeItemGrid.ts` / `useFilterPanel.ts` 等 composable，**没有任何组件**。命名应为 `composables/` 或合并入既有 `containers/composables/`。

---

## 3. Action 体系的双源问题（最大精简点）

包内并存**两套**内置动作系统，各自带有 meta / 执行器 / 禁用判断 / 文案插值：

### 3.1 两条路径

| 维度 | 路径 A：`ActionDescriptor` | 路径 B：`BuiltinAction` |
|---|---|---|
| 入口 | `rule.json` 的 `on` 事件、容器顶层 `actions` 字段 | `SparkNode props.action`（按钮/工具栏） |
| 动作描述符 | [page/actions/action-descriptor.ts](../../packages/spark-component/src/page/actions/action-descriptor.ts) | 同样使用 `props.action` 字符串 |
| 执行 | [page/actions/action-executor.ts](../../packages/spark-component/src/page/actions/action-executor.ts) `executeActionDescriptor` | [components/containers/support/actions/builtin-action-handler.ts](../../packages/spark-component/src/components/containers/support/actions/builtin-action-handler.ts) `createBuiltinActionHandler` |
| Meta（label/icon） | 共用 [page/actions/builtin-action-meta.ts](../../packages/spark-component/src/page/actions/builtin-action-meta.ts) | 同上（已对齐） |
| 模板 | — | [button-templates.ts](../../packages/spark-component/src/components/containers/support/actions/button-templates.ts) |
| 禁用判断 | 路径 A 在 execute 内做防御 | [builtin-action-disabled.ts](../../packages/spark-component/src/components/containers/support/actions/builtin-action-disabled.ts) 显式声明 `disabledWhenRow` |
| 文案插值 (`{count}`) | ❌ 无 | ✅ `interpolateMessageProps`（仅路径 B） |
| 行权限投影 | ❌ 无 | ✅ 经 `RendererButton.permissionAllowed` 落地 |

### 3.2 动作名重叠/差集

```
共有：append-row, delete-current, delete-selected, refresh
仅 ActionDescriptor：show-message, confirm, alert, navigate, set-field, open
仅 BuiltinAction：prompt-append, prompt-edit, submit-current-form, clear-rows,
                  move-row, move-current, delete-row, patch-row, patch-selected,
                  message-row, message-current
```

四个共有动作都是**容器数据动作**。它们在两套体系内都需要：

- 取数据源（`DATA_SOURCE` / `dataKey` 解析）
- 行/选择行解析
- 权限投影
- 确认对话 + 文案插值

但实现两份：
- ActionDescriptor 路径调 `view.removeRow(id)`、消息固定模板。
- BuiltinAction 路径调 `view.removeRow(id)`、消息支持 `{count}` 插值。

### 3.3 真正的语义边界

- **路径 A 的不可替代价值**：可链式（`then`）、可嵌入 `on` 事件、可被 `script.js` 触发 → 它是“**任意时机**触发的页面级动作”。
- **路径 B 的不可替代价值**：与按钮 props 紧耦合（buttonType / confirmTitle / silent / failureMessage）、能投影行权限至 `disabled` → 它是“**按钮承载**的动作”。

> 二者本质上是一套语义（“执行一个具名动作”），只是**触发面不同**。

---

## 4. 权限决策的三路冗余

| 路径 | 文件 | 输入 | 输出 |
|---|---|---|---|
| 1 | [permission/PermissionChecker.ts](../../packages/spark-component/src/permission/PermissionChecker.ts) | `row._perm` / `_modelPerm` / mode | `canDelete` / `canEdit` / `isFieldVisible` 等纯函数 |
| 2 | [permission/PermissionResolver.ts](../../packages/spark-component/src/permission/PermissionResolver.ts) | `action` 字符串 + context | `isPermittedAction(action, ctx)` |
| 3 | [components/containers/support/actions/builtin-action-disabled.ts](../../packages/spark-component/src/components/containers/support/actions/builtin-action-disabled.ts) | SparkNode + DataView | `isBuiltinActionDisabled` |

外加 [non-data-components/RendererButton.vue](../../packages/spark-component/src/components/containers/non-data-components/RendererButton.vue) 中的 `permissionAllowed` / `resolvePermissionScopeRows` 自身的判定。

四处都需要回答“**这一行/这一动作是否被允许**”，但：

- Path 1 是“能否做某类操作”
- Path 2 把动作名映射成 Path 1 的某个调用
- Path 3 是“是否禁用 BuiltinAction 按钮”
- RendererButton 是“UI 层最终是否禁用”

**可疑重复点**：Path 2 → Path 1 是 1-N 装饰；Path 3 与 RendererButton 都在“按钮可不可点”这一语义下。

---

## 5. 数据通路（结构清晰，无重大冗余）

```
pagedata.json
   ↓ parsePageData()      (spark-page-config)
DataSet
   ↓ usePageDataSet()     → sparkProvide(PAGE_DATASET)
   ↓ DataKey('table@view@field')
DataView
   ↓ sparkProvide(DATA_SOURCE)        (容器层)
   ↓ sparkProvide(DATA_ROW)           (RendererHostScope/FieldScope)
叶子组件 sparkConsume
```

[useContainerDataSource.ts](../../packages/spark-component/src/components/containers/composables/useContainerDataSource.ts) 是**唯一**容器数据源消费入口，r-table / r-form / r-detail / r-tree 均经此而非各自实现。无重复。✅

唯一可优化点：

- `PAGE_COMPONENT_REGISTRY` / `MODULE_CONTEXT` 的 capability key 命名前缀是 `app:`，其余 capability 都是 `spark:capability:` —— 风格不一致。

---

## 6. 命名一致性

### 6.1 ✅ 已一致
- 容器组件：`Renderer*`（与 `r-*` 对齐）
- 系统类型：`Spark*`（SparkNode / SparkComponentRenderer）
- Capability key：`PAGE_*` / `DATA_*` / `APP_*` 三组分明
- 执行上下文：`*Context`（`ActionExecutionContext` / `BeforeRenderContext`）

### 6.2 ⚠️ 不一致
| 维度 | 现状 | 建议 |
|---|---|---|
| 执行器术语 | 同时使用 `handler`（`createBuiltinActionHandler`、`crud-event-defaults`）和 `dispatcher`（`crud-dispatcher.ts`）和 `executor`（`executeActionDescriptor`） | 统一为 **`executor`**（对齐 ActionDescriptor 路径） |
| 行作用域 | `BuiltinActionScope { row?, index? }` vs `BeforeRenderContext { row, data, index, dataSource, modelPermission, host }` | 用 `BeforeRenderContext` 子集替代 `BuiltinActionScope` |
| host 概念 | 同时表示“**SparkNode 的宿主组件类型**”和“**ACTION_CAPABILITY 宿主**” | 前者改名 `parentType` |
| `current` vs `selected` | 已基本一致（DataView.currentRow / selectedRows） | ✅ |

### 6.3 ❓ 半死代码：`ACTION_CAPABILITY`

- 已声明：[capability-keys.ts L72](../../packages/spark-component/src/core/capability-keys.ts) — `defineCapability<SparkActionCapability>('spark:capability:action-host')`。
- **有 3 处 consume**，全部位于 [RendererButton.vue](../../packages/spark-component/src/components/containers/non-data-components/RendererButton.vue)（L88 `resolveActionHost`；L274 `submit-current-form` 分支；L284 兜底 `actionHost.execute`）。
- **没有任何 provider**：仓库范围内搜索 `sparkProvide(ACTION_CAPABILITY` 零命中。
- **运行时实际行为**：`RendererButton` 走 fail-soft 兜底——没有 host 时直接 `return`。也就是说：
  - **路径优先级**：`view 存在` → `executeBuiltinActionDirect`（`createBuiltinActionHandler` 当场创建）→ 不依赖 ACTION_CAPABILITY。
  - **唯一依赖 ACTION_CAPABILITY 的分支**：`submit-current-form`（[RendererButton.vue L274-L277](../../packages/spark-component/src/components/containers/non-data-components/RendererButton.vue)）——但因无 provider，**该按钮在当前代码下永远不会执行**。这是一处隐性失效。
- **结论**：要么补 provider 并把所有内置动作迁移到 ACTION_CAPABILITY 链路；要么删掉该 capability + `submit-current-form` 分支，改为 view 直驱（`builtinActionHandler.handleToolbar`）。倾向后者：与 P1-A「统一 Action 真源」一致。

---

## 7. 公共 API 暴露面

[src/index.ts](../../packages/spark-component/src/index.ts) 导出 150+ 项目，混合三档：

1. **核心运行时**（`SparkComponentRenderer` / `SparkPageRenderer` / `useSparkComponent` / capability keys / SparkNode 类型）
2. **高级类型**（各容器 props.ts、各 actions descriptor 类型）
3. **内部细节**（`* as permission`、AI composable、JSON tree editor）

建议拆分为 `index.ts` / `index.advanced.ts` / `index.internal.ts` 三档，或对内部细节加 `@internal` JSDoc 标签便于工具忽略。

---

## 8. 精简执行清单（按优先级）

### P1：消除语义重复（核心架构层）

| # | 项目 | 操作 | 影响面 |
|---|---|---|---|
| **P1-A** | ~~**统一 Action 真源**~~ ✅ 已完成（2026-04-30）：彻底删除 `builtin-action-handler.ts`（~1100 行），`executeActionDescriptor` 成为唯一动作执行入口；新增 `nodeToActionDescriptor(node, scope?)` 翻译层把 SparkNode → ActionDescriptor。23 个内置动作合并为 14 个判别联合（delete/patch/move/message-row 用 `target: 'scope'\|'current'\|'selected'`；prompt-append/prompt-edit 折叠成 AppendRow/Patch 的 `prompt` 修饰）。模块结构：[packages/spark-component/src/page/actions/](../../packages/spark-component/src/page/actions/)（action-descriptor / executor-helpers / data-capabilities / action-notifier / executors/{show,data,form} / action-executor / node-to-descriptor）。 | — |
| **P1-B** | ~~**权限决策收敛**~~ ✅ 现状已满足（2026-04-30 复核）：`PermissionChecker` 仅纯函数；`PermissionResolver.isPermittedAction` / `isModel/RowActionAllowed` 做动作→checker 派发；`isBuiltinActionDisabled` 已只判断数据态（disabledWhenRow / view.rows / currentRow / selectedRows），**无权限调用**；`RendererButton.permissionAllowed` 通过 `usePermission` 薄壳消费 Resolver。四路职责已剥离，无需进一步合并。 | — |
| **P1-C** | ~~**删除 `ACTION_CAPABILITY` 链路**~~ ✅ 已完成（2026-04-30，随 P1-A 重构）：RendererButton 已迁至 `executeActionDescriptor`，packages 内零引用；eslint 白名单与 CAPABILITY_SYSTEM_MIGRATION 文档同步清理。 | — |
| **P1-D** | ~~**Capability key 前缀统一**~~ ✅ 已完成（2026-04-30）：`PAGE_COMPONENT_REGISTRY` / `MODULE_CONTEXT` 已从 `app:*` 切换为 `spark:capability:*`，所有 capability key 现统一前缀。 | — |

### P2：分类边界清理

| # | 项目 | 操作 | 影响面 |
|---|---|---|---|
| **P2-A** | ~~**拆解 `containers/support/`**~~ ✅ 部分完成（2026-04-30）：删除死代码 `action-visibility.ts`（零引用）；`builtin-action-disabled.ts` / `builtin-action-helpers.ts` / `button-templates.ts` 移入 [packages/spark-component/src/page/actions/](../../packages/spark-component/src/page/actions/)，与执行器统一入口；6 处消费方 + 1 处测试 import 同步更新。`containers/support/` 剩余 CRUD/Scope/InteractionControl 部分按 P2-B 评估，本轮不动。 | — |
| **P2-B** | **`RendererHostScope` / `RendererFieldScope` 升类** | 移入 `data-components/` 或独立 `scope/` —— 它们是 DATA_ROW 的核心提供者，等同一级容器。 | 中 |
| **P2-C** | **`layout/` 改名** | 重命名为 `composables-layout/` 或合并入 `containers/composables/`。 | 低 |
| **P2-D** | **`RendererFilter` / `RendererHeader/Footer/Tail` / `RendererEditor` 归类** | Filter → data-components；Header/Footer/Tail → `containers/structure/`；Editor → `support/editor/` 或并入 fields。 | 低 |
| **P2-E** | **AI composable 出包** | [composables/](../../packages/spark-component/src/composables/) 全部为 AI 逻辑，与渲染层无关。迁出到 `@spark-view/spark-app` 或新设 `spark-ai-ui`。 | 中（导出面变窄） |

### P3：命名/术语收敛

| # | 项目 | 操作 | 影响面 |
|---|---|---|---|
| **P3-A** | `handler` / `dispatcher` → `executor` | crud-dispatcher.ts → crud-executor.ts；createBuiltinActionHandler → createBuiltinActionExecutor。 | 低（机械改名） |
| **P3-B** | `BuiltinActionScope` 收敛到 `ActionContext` | 复用 BeforeRenderContext 的 row/index/dataSource 子集。 | 低 |
| **P3-C** | `host.type` → `parentType` | 在 BeforeRenderContext 内部消歧。 | 低 |

### P4：工具与 API

| # | 项目 | 操作 | 影响面 |
|---|---|---|---|
| **P4-A** | `builtin-action-helpers.ts` 拆解 | 通用 `readString/readBoolean/readStringArray` → `core/`；`interpolateMessageProps` 内化到 `action-executor.ts`；`extractErrorMessage` 移到 `spark-utils`（若未存在）。 | 低 |
| **P4-B** | 公共 API 分层 | `index.ts` 仅暴露核心；高级类型移到 `index.advanced.ts` 或加 `@internal` JSDoc。 | 中（外部使用方） |
| **P4-C** | Ambient 声明集中 | `declare const SparkText` 类的散落声明集中到 `env.d.ts`。 | 低 |

---

## 9. 待用户确认的歧义点

> 以下每点都对 P1/P2 的具体执行方案有方向性影响，建议先答这些再动手。

1. `ACTION_CAPABILITY` 是否计划启用？已确认：声明 + RendererButton consume，但**零 provider**，`submit-current-form` 因此永远不会执行。倾向删除（P1-C）。需要确认：`submit-current-form` 是否在生产页面 rule.json 中被使用？（grep 显示是 BuiltinAction 16 项之一，但既然 ACTION_CAPABILITY 无 provider，目前事实上不可用。）
2. 共有动作合并后，是否允许 `BuiltinAction` 透传 ActionDescriptor 的 `then` 链式？（影响 P1-A 的语义范围）
3. `containers/support/` 重构后，外部包（spark-app / 测试）是否依赖具体路径？是否允许 import 路径破坏性变更？（影响 P2-A 一次到位还是渐进）
4. AI composable（`useAiChat` / `useAiPanelStore` / `useAiSenderHelpers`）当前在 spark-component 是否有外部包导入？是否可独立 package？（影响 P2-E）
5. `layout/`、`RendererHeader/Footer/Tail`、`RendererEditor` 是否在 stills/AI 编辑面板中被显式引用？（影响 P2-D 命名）
6. `r-list` / `RendererRowFragment` 是否仍是一类容器？（与 `r-table` 列模板的关系）

---

## 10. 风险与不做项

- **不建议**：把 `BuiltinAction` 完全砍掉合并入 `ActionDescriptor`。BuiltinAction 的“按钮 props 直接驱动行为”是 SPARK Config-first 理念的一等表达，删除会破坏 rule.json 既有页面。P1-A 的目标是“**复用执行**而非**取消装饰**”。
- **不建议**：将 `Permission*` 抽出独立包。当前耦合点（`_perm` / `_modelPerm` / `editableFields`）是 SPARK 数据约定的一部分，独立包会造成额外的循环依赖治理成本。
- **不动 `data-components/` 目录结构**：当前 r-table / r-form / r-detail / r-tree / r-list 分文件夹方案清晰，不建议强行合并。

---

## 11. 验证策略

任何 P1/P2 改动后必须：

1. `pnpm run typecheck` 通过；
2. `pnpm run lint` 通过；
3. 在工作区根运行 `npx vitest run tests/renderer-table.datasource.test.ts tests/permission-resolver.test.ts tests/permission-checker.test.ts`；
4. 手测页面：
   - [r-table-series](../../spark-ai-server/data/pages-config/lmspark/homepage/r-table-series/rule.json)（含 delete-current / delete-selected / refresh / patch-current / message-current 全套 BuiltinAction）
   - [section-grid-demo](../../spark-ai-server/data/pages-config/lmspark/homepage/section-grid-demo/rule.json)
5. `cd packages/spark-component && pnpm run build`（dist 必须重生，否则 dev 仍读旧 dist）。

---

## 12. 修订记录

- **v2 (2026-04-30 后续)**：基于直接源码 first-hand 阅读修正：
  - `ACTION_CAPABILITY` 实际**有 3 处 consume（全在 RendererButton.vue）但零 provider**，`submit-current-form` 走的就是这条死路；P1-C 从"若无引用则删"明确为"删 capability + RendererButton 中相关分支"。
  - P1-D 补充精确证据：仅 `PAGE_COMPONENT_REGISTRY` / `MODULE_CONTEXT` 是 `app:` 前缀（[capability-keys.ts L65-L72](../../packages/spark-component/src/core/capability-keys.ts)）。
  - PermissionResolver 直接读源码确认：`resolveNodePermAction` 把 BuiltinAction 名映射到 6 类 permAction（create / import / export / create-child / delete / edit），与 PermissionChecker 完全配套。P1-B 描述与现状对齐。
  - RendererButton 的 `permissionAllowed` 工具栏多选行权限投影行为已直接核对（[RendererButton.vue L96-L113, L141-L154](../../packages/spark-component/src/components/containers/non-data-components/RendererButton.vue)），描述准确。
- **v1 (2026-04-30)**：初版，基于 Explore 子代理整体扫描产出。

*文档版本：2026-04-30 v2 · 基于分支 `refactor/action-capability-cleanup-2026-04-30`。*
