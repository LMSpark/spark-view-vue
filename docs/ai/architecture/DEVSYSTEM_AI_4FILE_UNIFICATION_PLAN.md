# DevSystem AI 四文件同层统一方案

> 状态：预研梳理 / 方案文档
>
> 本文用于收敛 DevSystem 当前 AI 体系、明确统一目标，并作为后续正式实施的母版。
>
> 审核版实施计划书见： [DEVSYSTEM_AI_4FILE_IMPLEMENTATION_REVIEW_PLAN.md](DEVSYSTEM_AI_4FILE_IMPLEMENTATION_REVIEW_PLAN.md)
>
> 当前实际实施偏差、已落地项与验证结果，也统一回填在 [DEVSYSTEM_AI_4FILE_IMPLEMENTATION_REVIEW_PLAN.md](DEVSYSTEM_AI_4FILE_IMPLEMENTATION_REVIEW_PLAN.md)。
>
> **实施底线**：所有后续代码变更必须遵守 [AI_CODE_CHANGE_PROTOCOL.md](../AI_CODE_CHANGE_PROTOCOL.md)。在未完成协议要求的提问、充分性评估、方案审核前，本文不直接视为开工许可。

---

## 一句话结论

DevSystem 的 AI 体系必须统一到**页面级 4 文件编辑层**，以单一会话、单一 AI 入口、单一导出语义承载 `rule.json`、`pagedata.json`、`script.js`、`style.css` 的协同编辑；`Rule` 设计器与 `DataSet` 设计器都应降级为该统一会话下的不同视图，而不是各自持有一套 AI 系统。

---

## 当前现状梳理

### 1. 当前实际存在的 AI 入口

| 入口 | 文件 | 用户心智 | 底层链路 |
|------|------|----------|----------|
| Rule 工作区 AI | [DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) | 4 文件同层编辑 | `AiChatWidget -> useRuleEditSession.runLlm -> runStillsLoop -> SessionBackendImpl -> /api/ai/sessions/*` |
| 文件侧栏 AI | [DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue) | 表面是文件级，实际上仅 `rule.json` 有效 | 复用 `useRuleEditSession` |
| DataSet 设计器 AI | [DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue) | `pagedata.json` 独立编辑 | 独立 `fineEditSession/fineEditBackend` + `runStillsLoop` |

### 2. 当前协议层和 UI 层并不在一个层面

底层其实已经高度统一：

- 聊天组件统一走 [useAiChat.ts](../../../src/composables/useAiChat.ts)
- 会话后端统一走 [session-backend.ts](../../../packages/spark-ai/src/session-backend.ts)
- SSE 协议统一走 `/api/ai/sessions/{sessionId}/turn/stream`
- stills edit-domain 原生支持 4 文件状态，见 [edit-state.ts](../../../packages/spark-ai/src/stills/edit-state.ts)

真正分裂的是上层产品组织：

- Rule 线自己有一套会话宿主：[useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts)
- DataSet 线自己有一套会话与编排：[DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue)、[datasetFineEditOrchestration.ts](../../../src/views/app/dev-system/datasetFineEditOrchestration.ts)
- 文件级 AI 入口 [DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue) 只剩 rule 特化，不再是真正通用入口

### 3. 四文件真源已经天然存在

页面四文件的事实源都在 [useDevState.ts](../../../src/views/app/dev-system/useDevState.ts) 的 `editFiles`：

- `rule.json`
- `pagedata.json`
- `script.js`
- `style.css`

这意味着：

1. DevSystem 从状态层就已经是“4 文件同层编辑”模型。
2. 当前 AI 体系没有统一到这个层面，只是 UI 和会话设计落后于状态真相。

### 4. 当前最主要的结构性问题

#### A. 会话分裂

- Rule 线通过 [useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts) 创建 `StillsSession + SessionBackendImpl`
- DataSet 线在 [DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue) 内再次创建 `fineEditSession + fineEditBackend`
- 结果：同一页面存在两套 AI 历史、两套 sessionId、两套提示词、两套导出语义

#### B. 导出语义分裂

- Rule 线导出用 `edit.exportFiles`，返回 4 文件，见 [edit-export-stills.ts](../../../packages/spark-ai/src/stills/edit-export-stills.ts)
- DataSet 线导出用 `dataset.export`，只回写 `pagedata.json`
- 结果：用户理解的“页面 AI 编辑”和底层真正应用的文件粒度不一致

#### C. Prompt / Profile 分裂

- Rule 线使用通用 `STILLS_EDIT_RUNTIME_PROMPT`
- DataSet 线使用 [datasetFineEditOrchestration.ts](../../../src/views/app/dev-system/datasetFineEditOrchestration.ts) 单独构造的 prompt / monitor / tool 约束
- 结果：不同入口的 AI 行为风格不同，且难以复用会话

#### D. UI 入口重叠且互相打架

- `DevRuleEditor` 自带右侧 Rule AI
- `DevFileEditor` 右侧曾经承载通用文件 AI，但现在实际只剩 rule 特化
- `DevDataSetDesigner` 自带 DataSet AI
- 结果：不同场景下会出现双 AI、无 AI、或切文件后 AI 身份变化的问题

---

## 目标架构

## 任务目标

把 DevSystem AI 统一为“**一个页面、四个文件、一个会话、一个 AI**”的页面级编辑系统。

## 核心原则

1. **唯一会话宿主**：同一页面只允许一个 AI 会话。
2. **四文件同层**：`rule`、`pagedata`、`script`、`style` 始终属于同一编辑上下文。
3. **唯一 AI 入口**：用户只面对一个 AI 面板，而不是 Rule/DataSet/文件侧栏三套产品。
4. **视图与会话解耦**：Rule 设计器、DataSet 设计器、文本编辑器都只是视图，不再各自持有独立 backend/session。
5. **统一导出语义**：用户层只认页面级导出应用；局部导出仅作为内部能力而非主交互协议。

## 推荐目标形态

### 唯一 AI 宿主

唯一 AI 宿主放在 [DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue)。

原因：

- 它紧贴四文件编辑 UI
- 它天然知道当前 `activeFile`
- 它已经连接 [useDevState.ts](../../../src/views/app/dev-system/useDevState.ts) 的四文件状态
- 它最适合承载“当前焦点文件”与“全页面上下文”的双重语义

### 唯一会话层

新增 `useUnifiedEditSession`，取代当前 Rule 专用的 [useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts)。

它应具备：

- 单一 `StillsSession`
- 单一 `SessionBackendImpl`
- 单一 `backendSessionId`
- 单一 4 文件 bootstrap
- 可根据 `domain` 或 `focus` 切换 prompt/profile/tool 白名单

### 视图定位

| 模块 | 未来角色 |
|------|----------|
| [DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue) | 唯一 AI 入口 + 页面级 4 文件编辑壳 |
| [DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue) | `pagedata.json` 的可视化视图，不再拥有独立 AI 会话 |
| [DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) | 过渡期工作区壳；长期应退出独立 AI 宿主地位 |
| [DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue) | 应删除或并入统一 AI 面板 |
| [datasetFineEditOrchestration.ts](../../../src/views/app/dev-system/datasetFineEditOrchestration.ts) | 收缩为 dataset profile/prompt 构造，不再承担独立 orchestrator 身份 |

---

## 影响范围

以下是**预计**的实现影响范围，用于后续正式实施时收口边界。

### 核心前端文件

- [src/views/app/dev-system/DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue)
  - 改为唯一 AI 宿主
  - 承担当前焦点文件 / 当前视图 / 统一 AI 面板状态

- [src/views/app/dev-system/composables/useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts)
  - 重构或替换为 `useUnifiedEditSession`
  - 保留底层 stills bootstrap / SSE / export 能力，但取消 Rule 专属命名和心智

- [src/views/app/dev-system/DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue)
  - 删除独立 `fineEditSession` / `fineEditBackend`
  - 改为复用统一会话层

- [src/views/app/dev-system/datasetFineEditOrchestration.ts](../../../src/views/app/dev-system/datasetFineEditOrchestration.ts)
  - 收缩为 dataset-focused profile/prompt/summary helper

- [src/views/app/dev-system/DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue)
  - 删除或并入统一 AI 面板

- [src/views/app/dev-system/DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue)
  - 移除独立 AI 会话宿主定位
  - 改为工作区壳，或在后续阶段删除

### 相关支撑文件

- [src/views/app/dev-system/DevSystem.vue](../../../src/views/app/dev-system/DevSystem.vue)
  - 重新定义 `dataset` / `rule` tab 的角色

- [src/views/app/dev-system/useDevState.ts](../../../src/views/app/dev-system/useDevState.ts)
  - 可能补充“确保四文件加载完成”的统一 helper

- [packages/spark-ai/src/stills/edit-export-stills.ts](../../../packages/spark-ai/src/stills/edit-export-stills.ts)
  - UI 层导出协议需要统一收敛到页面级语义

- [packages/spark-ai/src/stills/edit-state.ts](../../../packages/spark-ai/src/stills/edit-state.ts)
  - 保持 4 文件同会话状态作为根基，不应再被上层绕开

---

## 技术方案

### 阶段 0：文档与协议对齐（当前阶段）

目标：在编码前形成统一设计共识。

执行结果：

- 本文作为 DevSystem AI 统一方案母版
- 后续任何代码实施都必须回到 [AI_CODE_CHANGE_PROTOCOL.md](../AI_CODE_CHANGE_PROTOCOL.md) 的流程里继续推进

### 阶段 1：统一会话层

目标：消除 Rule 线与 DataSet 线的会话分裂。

实现步骤：

1. 以当前 [useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts) 为基座抽象出 `useUnifiedEditSession`
2. 保持 `edit.bootstrap` 仍以 4 文件初始化
3. 让 dataset 视图不再创建自己的 session/backend，而是调用统一会话层的 `runLlm(prompt, profile)`
4. 让统一会话层负责 resumeSessionId、delta/reasoning/result、最终 export/apply

关键决策：

- 会话隔离建议按 `activePageId` 维度，而不是全局单例
- 不把 DataSet 设计器的独立 backend 延续到新架构

### 阶段 2：统一 AI 入口

目标：同一页面只保留一个 AI 面板。

实现步骤：

1. 在 [DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue) 建立统一 AI 面板
2. 当前焦点文件只影响 AI 的 profile/focus，不再决定是否切换为另一套系统
3. 删除 [DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue) 的独立存在意义
4. 将 [DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) 的右侧 Rule AI 降级或移除

关键决策：

- 用户只面对“页面编辑 AI”，不再面对“Rule AI / DataSet AI / 文件 AI”三种产品概念

### 阶段 3：统一视图与导出语义

目标：让 `pagedata.json` 文本编辑和可视化设计器回到同一文件视图内。

实现步骤：

1. 把 [DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue) 变成 `pagedata.json` 的可视化视图
2. 在 [DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue) 中支持 `pagedata.json` 的“文本 / 可视化”切换
3. 页面级 AI 最终统一使用页面级 export/apply 协议
4. `dataset.export` 降级为内部或兼容能力，不再作为用户主协议

关键决策：

- DataSet 设计器不再是独立产品，只是 `pagedata.json` 的高阶编辑视图

### 阶段 4：清理 stills 注册与 profile 构造

目标：停止继续局部补丁。

实现步骤：

1. 避免多个入口重复 `clearRegistry/clearDomains/registerEditStills`
2. 收敛为统一的注册与 profile 构造层
3. Rule / DataSet 的差异只存在于 profile，不存在于会话宿主和导出协议

---

## 兼容性

### 对现有功能的影响分析

- 正向收益：
  - 消除“有时双 AI、有时无 AI”的 UI 混乱
  - 消除 Rule/DataSet 两套 sessionId 无法续接的问题
  - 消除 4 文件上下文在不同入口里被切碎的问题

- 需要谨慎兼容的点：
  - [DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) 的工作区形态可能需要过渡期保留
  - [DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue) 的本地 UI 状态（选中表、展开折叠、布局）需要与统一会话层解耦
  - `dataset.export` 可能仍要保留一段时间，避免低层工具或兼容链路断裂

### 破坏性变更

潜在破坏性变更包括：

1. 删除 [DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue)
2. 弱化或删除 [DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) 的独立 AI 地位
3. 调整 `dataset.export` 在 UI 层的使用方式

这些都应在正式实施前经过单独确认。

---

## 验证计划

### 需要运行的检查

- `pnpm run typecheck`
- `pnpm run lint`

### 需要人工验证的关键场景

1. 同一页面中，先改 `rule.json` 再切到 `pagedata.json`，AI 仍保留上一轮上下文
2. 在 `pagedata.json` 可视化设计器里发起 AI 编辑，随后切回 `rule.json`，仍是同一个会话
3. `script.js` / `style.css` 在统一 AI 面板下仍能被作为焦点文件处理，而不是再次出现“无 AI”
4. 页面级导出应用后，4 文件 dirty 状态与写回结果一致
5. 不再出现双 AI / 无 AI / 因布尔默认值导致 AI 消失的问题

---

## 风险项

### 已知风险

1. **DataSet 设计器 UI 状态同步复杂**
   - 风险：可视化布局、选中态、展开态与统一会话层模型之间存在同步难度
   - 缓解：严格把设计器状态限定为投影/UI 状态，不让其成为新的事实源

2. **Prompt 统一后行为可能短期波动**
   - 风险：Rule 和 DataSet 目前存在不同的 prompt/profile；统一后需要重新校准模型行为
   - 缓解：保留 profile 差异，但不再保留多套会话宿主

3. **过渡期 UI 认知变化**
   - 风险：用户已经习惯 `Rule` 标签页和 `DataSet` 标签页的现有入口
   - 缓解：先统一底层会话，再渐进式收口 UI，而不是一步删除所有入口

### 必须先拍板的问题

1. [DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) 是保留为工作区壳，还是最终删除？
2. `dataset` 独立标签页是否长期保留，还是最终回归 `pagedata.json` 文件视图？
3. UI 层是否明确禁止再出现多个并列 AI 面板？

---

## 推荐决策摘要

1. DevSystem AI 统一层面必须放在页面级 4 文件编辑层，而不是 Rule 层或 DataSet 层。
2. [DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue) 应成为唯一 AI 宿主。
3. [useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts) 应重构为通用 `useUnifiedEditSession`。
4. [DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue) 只保留为 `pagedata.json` 的可视化视图，不再拥有独立会话。
5. [DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue) 不应继续保留为独立产品入口。
6. [DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) 长期应退出独立 AI 宿主地位。
7. UI 层最终只应面向一种产品概念：“页面编辑 AI”。
8. 用户层导出语义应统一到页面级，而不是继续分裂为 4 文件导出和单文件导出两套主协议。
9. 后续所有代码实施都必须以 [AI_CODE_CHANGE_PROTOCOL.md](../AI_CODE_CHANGE_PROTOCOL.md) 为底线，先澄清、再出正式计划、经审核后再编码。
