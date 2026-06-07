# AI-Native 系统运行时契约

> 状态：草案（2026-06）。定义 SPARK 交付物如何**出厂即 Agent-ready**：开发态与运行态共用语义，VCM 注解即能力注册，企业 AI 运行时统一执行。
>
> 关联：[spark-ai-new-system.md](spark-ai-new-system.md)、[../architecture/PLATFORM_TENANT_ROUTING.md](../architecture/PLATFORM_TENANT_ROUTING.md)、`packages/spark-project-model/src/MODEL-HIERARCHY.md`。

## 1. 定位

SPARK 的目标不是「AI 辅助软件开发」，而是：

```text
交付的每一套应用 = 企业 AI 运行时中的一个可发现、可调用、可治理的子系统
```

| 层次 | 含义 |
|---|---|
| **开发 AI 化** | 用 Agent 生成/修改 ProjectModel、四文件、导航策划 |
| **系统 AI 融合** | 上线后的业务页、DataSet、集成连接器，与人共用同一语义 API |
| **融合平台** | iPaaS 数据动脉 + aPaaS 应用工场 + Agent 中枢；AppWorks 是 aPaaS 中默认 Agent-ready 的一层 |

**禁止**：做人用系统 + 外挂 Copilot 读 DOM / 扫源码。  
**要求**：VCM 在源码声明的能力 = 运行期 Agent 可依赖的契约。

---

## 2. 核心原则

1. **注解即注册**：TS JSDoc / Java 注解 → VCM 提取 → `AiModuleMetadataJson` → `AiModuleAdapter`；手写 metadata 仅作过渡。
2. **设计 / 运行同词汇**：`DataTable` / `DataView` / `SparkNodeTree` / `dataViewKey` 在 design 与 runtime 同名；差异在 **实例与 mutation 权限**，不在另一套 API。
3. **Agent 树 = 能力对象树**：由 `kind` + `resultApis` + `parentKind` 组成；`module_find` 只负责发现/定位，模型修改优先由 `module_script` 执行原生代码。
4. **Fail-fast**：未注册的能力不可调用；Agent 路径须过权限与闸门；错误带 `code/msg/fix/checks`。
5. **配置即行为**：四文件 + pagedata 是运行真源；语义操作优先于 DOM 操作。

---

## 3. 双平面：Design Plane 与 Runtime Plane

```text
                    ┌─────────────────────────────────┐
                    │     企业 AI 运行时 (spark-ai)      │
                    │  module_query / guide / script   │
                    └───────────────┬─────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
   ┌──────────────────────┐                 ┌──────────────────────┐
   │  Design Plane         │                 │  Runtime Plane        │
   │  实施 / 第二阶段       │                 │  业务 / 上线后         │
   │  ProjectWorkspace     │                 │  已加载 Page + DataSet │
   │  ProjectModel         │                 │  PageRuntimeContext    │
   │  ConfigPageNode       │                 │  live DataSet/Views    │
   └──────────────────────┘                 └──────────────────────┘
              │                                           │
              └─────────── 同一 VCM kind 族 ──────────────┘
                          dataset / data-table / data-view / node-tree
```

| 平面 | 根实例 | 典型任务 |
|---|---|---|
| **Design** | `ProjectModel`（`@moduleKind project`） | 策划只读、openPageDesign、改四文件 |
| **Runtime** | `PageRuntimeContext`（`@moduleKind page-runtime`，待实现） | 筛选、汇总、填表、跨视图联动 |

两平面 **不复制 metadata 文件**；runtime 模块引用同一 `$defs`，通过 `plane: design | runtime` 裁剪可写 mutation。

---

## 4. Agent 路径规范

路径是 Agent 树的**实例坐标**，与 [PLATFORM_TENANT_ROUTING.md](../architecture/PLATFORM_TENANT_ROUTING.md) 作用域一致。

pageDesign 写模型时不把路径链作为主用法。LLM 应在 `module_script({ script })` 中通过当前 `ProjectModel` 上下文直接编程：

```ts
const page = await this.openPageDesign({ pageId })
await page.editDataSet(async (ds) => { /* pagedata.json */ })
await page.editNodeTree(async (tree) => { /* rule.json */ })
page.setFileText('script.js', scriptText)
page.setFileText('style.css', styleText)
return {
  ruleJson: page.getFileText('rule.json'),
  pageDataJson: page.getFileText('pagedata.json'),
  script: page.getFileText('script.js'),
  style: page.getFileText('style.css'),
}
```

### 4.1 作用域前缀

```text
/tenant[<tenantId>]/project[<projectId>]
```

- 设计态编辑默认在该前缀下挂载 `ProjectModel`。
- 运行态在同一前缀下挂载 `runtime/page[<pageId>]`。

### 4.2 Design Plane 路径

```text
/tenant[t]/project[p]                          → kind: project
/tenant[t]/project[p]/page[<pageId>]           → kind: config-page   (ConfigPageNode)
/tenant[t]/project[p]/page[<pageId>]/node-tree → kind: node-tree
/tenant[t]/project[p]/page[<pageId>]/dataset   → kind: dataset       (DataSetCrudTool)
/tenant[t]/project[p]/page[<pageId>]/dataset/table[<tableName>]  → kind: data-table
.../table[<tableName>]/view[<viewId>]          → kind: data-view
```

与现有 pageDesign 注册一致：`moduleInstanceId` = `pageId`；`openPageDesign(pageId)` 进入 `config-page` 子树。

### 4.3 Runtime Plane 路径（目标）

```text
/tenant[t]/project[p]/runtime/page[<pageId>]           → kind: page-runtime
/tenant[t]/project[p]/runtime/page[<pageId>]/dataset   → kind: dataset
.../table[<tableName>]/view[<viewId>]                  → kind: data-view
```

运行态 **不提供** 任意 `rule.json` 结构写（除非用户持 design 角色且 impl 闸门允许 hotfix）；默认只允许 DataView 语义 mutation 与已声明的 script 钩子。

### 4.4 融合平台 iPaaS 路径（目标，Java VCM）

```text
/tenant[t]/integration/connector[<connectorId>]   → kind: connector
/tenant[t]/integration/flow[<flowId>]             → kind: integration-flow
```

与 AppWorks 页内 `CrudApi` 对齐；Agent 编排「拉数 → 改页 → 回写」时跨 design/runtime/iPaaS 三枝。

---

## 5. Kind 注册表（草案）

| kind | 源码 class（TS） | plane | 说明 |
|---|---|---|---|
| `project` | `ProjectModel` | design | 项目根；策划投影、openPageDesign |
| `config-page` | `ConfigPageNode` | design | 四文件编辑面 |
| `node-tree` | `SparkNodeTree` | design (+runtime read) | rule 组件树 |
| `component-catalog.json` | 组件 VCM 原始生成物/诊断输入；不注册为 AiModule 工具，不作为 LLM 主调用路径 |
| `dataset` | `DataSetCrudTool` | both | 页级 DataSet 入口 |
| `data-table` | `DataTable` | both | 表结构 + 视图容器 |
| `data-view` | `DataView` | both | 行/筛选/聚合/CRUD 语义 |
| `page-runtime` | `PageRuntimeContext`（待建） | runtime | 当前加载页外壳、绑定解析 |
| `connector` | Java 域对象（待 VCM） | runtime | iPaaS 连接器 |

**展开规则**（VCM `resultApis`）：

```text
project.openPageDesign → config-page
config-page.getNodeTree → node-tree
config-page.getDataSetTool → dataset
config-page.editNodeTree / editDataSet → module_script 内 mutator 回调暴露 node-tree / dataset（VCM 从 callback 首参推断 resultApis）
dataset.getTable → data-table
data-table.getView → data-view
page-runtime.dataset → dataset   （运行态 shortcut，待实现）
```

VCM 自动投影的 guide-only 子 kind（如 `config-page`、`node-tree`、`dataset`）由 `AiModuleAdapter.buildVcmGuideModules` 注册；`getNodeTree` / `getTable` / `editNodeTree` / `editDataSet` 的 `resultApis` 已投影到 `module_function_guide.programmingFlow`。

---

## 6. 三阶段与人工闸门（Agent 可见）

与实施流程对齐；闸门状态应进入**模型**（navigation 节点 meta 或 project sidecar），Agent 与 UI 共读。

| 状态 | 含义 | Design Agent | Runtime Agent |
|---|---|---|---|
| `planning_draft` | 策划初稿 | 可改 description/context | 不可进入 runtime |
| `planning_confirmed` | 策划定稿 | 可读 pageFeatures | 不可写四文件 |
| `impl_gate_open` | 人工按数据流放行实现 | 可 pageDesign | 不可改结构 |
| `impl_confirmed` | 单页实现定稿 | fix 模式 | 可语义操作 |
| `integration_passed` | 联调通过 | — | 全 mutation 按角色 |

闸门状态写入 navigation 节点字段（DevSystem「AI 闸门」面板）：

| 字段 | 取值 |
|---|---|
| `planningStatus` | `planning_draft` / `planning_confirmed`（空=按 effectiveDescription 推断） |
| `implGate` | `closed` / `open`（空=过渡期默认 open） |
| `upstreamContractsSatisfied` | `boolean`（默认 true） |

**Fail-fast 示例**（pageDesign runner 目标行为）：

```text
run pageDesign(pageId) 要求：
  planning_confirmed && impl_gate_open && upstream_contracts_satisfied
否则返回 checks：缺哪一页、哪张表、哪条连接器未就绪
```

`upstream_contracts_satisfied` 由融合平台数据契约（iPaaS）+ 项目内 pagedata 摘要 hash 共同判定。

---

## 7. 权限、审计与 Agent

Agent 不是超级用户。

| 规则 | 说明 |
|---|---|
| **同人同权** | Agent path 解析后，mutation 走与用户相同的 capability / 字段权限 / 页面模式 |
| **同审计** | `module_script` 写操作记 agentId、path、functionName、args 摘要 |
| **mutation 标签** | 源码 `@moduleMutation <resource> <mode> <desc>` 是 LLM 可见写边界；runtime 可再裁剪 |
| **script-only** | 含 callback 的 `editNodeTree` / `editDataSet` 仅 `module_script`，不可 direct call |

---

## 8. VCM 与 metadata 文件

| 文件 | 用途 |
|---|---|
| `*.api.generated.json` | 人工审查 + diagnostics；含 `resultApis` 深链 |
| `*.runtime.generated.json` | `AiModuleAdapter` 消费 |
| `component-catalog.json` | 组件 VCM 原始生成物/诊断输入；不注册为 AiModule 工具，不作为 LLM 主调用路径 |

构建命令：`pnpm run generate:module-metadata`  
诊断：`pnpm run diagnose:module-metadata`

**Java**：同一 `schemaVersion` 与 `$defs` 池化规则；提取器独立，输出合并进企业 metadata 仓库或 classpath resource。

---

## 9. 固定工具与执行顺序（LLM SOP）

与 [DM-VCM-MODULE-METADATA-SCOPE.md](../../packages/spark-ai/src/modules/DM-VCM-MODULE-METADATA-SCOPE.md) 一致：

```text
1. readPlanningProjection / module_query       → 确认 pageId、kind 与能力边界
2. module_function_guide / module_attribute_guide → 确认函数、属性、schema 与 resultApis
3. module_script({ script })                   → LLM 生成原生 JS，运行时执行
4. 返回 ruleJson / pageDataJson / script / style → runner 读取四文件 projection
5. agent_complete 或 human_question            → 完成或在闸门/歧义时中断
```

**Design 任务**：先 `readPlanningProjection`，再在 `module_script` 中 `await this.openPageDesign({ pageId })`，禁止从 navigation DTO 拼需求。  
**Runtime 任务**：先 `page-runtime` 读当前 view/table，再 mutation；禁止 DOM 选择器。

`functionName({ path, args })` 与 `module_call` 只作为单步读写和旧协议兼容；pageDesign 结构修改不得以 `/kind[id]/...` 路径链作为主生成目标。

### 9.1 FC 失败反推链（LLM 可见）

当 LLM function call 失败时，运行时按同一词汇把错误反查到 VCM 真源，再回灌 tool result：

```text
LLM FC 失败 (code/msg/fix/checks)
  → function-call-recovery-enricher 追加 RECOVERY_HINT checks
  → module_function_guide / module_query（能力目录 + 函数指南）
  → promptSnapshot 固定 SOP（目录优先、禁止猜 functionName）
  → *.runtime.generated.json（VCM 生成物）
  → 源码 JSDoc：@usageRule / @requiredBeforeCall / @failureMode
```

| 层 | 职责 |
|---|---|
| **JSDoc（真源）** | 在方法/属性首次声明处写 `@failureMode CODE when => fix`、`@usageRule`、`@requiredBeforeCall` |
| **VCM 生成器** | `pnpm run generate:module-metadata` 提取为 `usageRules` / `failureModes` / `requiredBeforeCall` |
| **指南投影** | `module_function_guide` 输出 `recoveryHints`、`functionLookupSteps`、`resultApis` 与 schema |
| **Prompt Snapshot** | 只教“怎么查”，不内嵌大 schema；强调 FC 失败先 guide 再重试 |
| **FC enricher** | `tool-call-executor` 在失败 tool result 中追加 `RECOVERY_HINT`，匹配 VCM `failureModes[code].fix` |

**验收**：LLM 在 `SCHEMA_VALIDATION_FAILED` / `FUNCTION_NOT_DECLARED` 后，下一轮 tool_calls 应出现 `module_function_guide` 或 `module_query`，而不是正文 `<tool_call>` 冒充调用。

---

## 10. 与 SPARK 融合平台的关系

```text
SPARK 融合平台
├── iPaaS（connector / CDC / 数据契约）─── Agent 树「骨架」
├── 治理（租户 / 权限 / 审计）─────────── Agent 红线
└── AppWorks（ProjectModel + DataSet）─── Agent 树「肌肉」

AppWorks 交付的不是静态页面，而是：
  pageFeatures（策划契约）+ 四文件（行为声明）+ VCM 面（操作契约）
```

第三阶段联调 = iPaaS 契约 + 多页 runtime Agent 路径的集成测试；失败则回流策划或单页 design。

---

## 11. 落地路线图

| 阶段 | 交付 | 状态 |
|---|---|---|
| **R0** | ProjectModel VCM + pageDesign metadata + DataSet kind 注解 | 已落地 |
| **R1** | `resultApis` 深链至 node-tree / dataset / data-table / data-view | 已落地（含 mutator callback 推断） |
| **R2** | LLM 直接生成 `module_script`，执行后得到四文件 projection，可选保存 dirty 文件 | 已落地 |
| **R3** | navigation meta：`planningStatus` / `implGate`；runner 门禁 | 进行中（runner + DevSystem 节点编辑） |
| **R4** | `PageRuntimeContext` + runtime path 注册 + 页面内 Agent 入口 | 待做 |
| **R5** | Java VCM + connector kind 并入同一运行时 | 待做 |
| **R6** | 业务对话壳（runtime Agent UI）+ 联调自动化 | 待做 |

---

## 12. 验收标准（AI-Native 就绪）

一个项目「AI-Native 就绪」当且仅当：

1. 所有 config-page 在 `pageFeatures` 中有 `effectiveDescription`。
2. generated metadata 中，从 `project` 到 `data-view` 路径可达且无 empty findings。
3. pageDesign Agent 可用一段 `module_script` 原生代码生成/修改 `rule.json`、`pagedata.json`、`script.js`、`style.css`。
4. 已 `impl_confirmed` 的页，runtime path 可绑定 live DataSet 并完成至少一种语义 mutation（如 setFilter）。
5. Agent 写操作与人操作产生相同 DataView 状态与审计记录。
6. 未 `impl_gate_open` 的页，design Agent 被 fail-fast 拒绝。

---

## 13. 非目标

- 不让 LLM 直接编辑 Vue SFC 或 Java Controller 作为默认路径。
- 不用 DOM/RPA 作为 AppWorks 页的主操作面。
- 不在 spark-ai 内核内嵌业务 live state；实例由消费层 `resolveInstance` 注入。
- 不恢复独立 `NavigationDesign` / `PlanningModel` 第二套领域。
