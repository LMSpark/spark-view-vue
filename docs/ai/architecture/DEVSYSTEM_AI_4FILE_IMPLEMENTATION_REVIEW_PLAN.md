# DevSystem AI 四文件统一实施计划书（含实施回写）

> 状态：已开工 / 阶段性回写
>
> 前置文档： [AI_CODE_CHANGE_PROTOCOL.md](../AI_CODE_CHANGE_PROTOCOL.md) 、 [DEVSYSTEM_AI_4FILE_UNIFICATION_PLAN.md](DEVSYSTEM_AI_4FILE_UNIFICATION_PLAN.md)
>
> 本文最初作为审核版计划书存在；在用户明确“开工”后，继续作为本轮 DevSystem AI 四文件统一工作的实施基线与偏差回填文档。

---

> 说明：下文“充分性评估 / 影响范围 / 验证计划 / 风险项”保留为开工前计划基线；当前真实落地状态以“实施回写”章节为准。

## 充分性评估

结论：**信息充分，可以进入方案审核阶段。**

已收口的关键歧义：

1. 删除 [src/views/app/dev-system/DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) 独立工作区。
2. 删除 [src/views/app/dev-system/DevSystem.vue](../../../src/views/app/dev-system/DevSystem.vue) 里的独立 DataSet 入口，收口到 `pagedata.json` 文件页。
3. AI 面板改为仅在 DevSystem 内可见的全局浮动面板，而不是嵌在局部编辑器侧栏中。
4. 会话模型为 DevSystem 内单一全局会话，跨页面连续对话。
5. 默认只允许当前页面真实读写；只有用户明确下达跨页修改指令时，才开启跨页真实编辑。
6. 显式跨页编辑时，允许按需自动加载当前项目中任意已有页面的 4 文件，但不允许自动新建页面。
7. AI 可以直接修改单页内的 `rule.json`、`pagedata.json`、`script.js`、`style.css` 四个文件。
8. AI 改动默认自动应用；若目标页面存在本地未保存改动，AI 结果直接覆盖，原页面快照进入撤销历史。
9. Undo / redo 采用页面级统一历史，AI 写回与手工编辑进入同一套历史栈。
10. 同一轮 AI 若影响多个页面，撤销粒度按页面事务拆分。
11. `pagedata.json` 文件页在结构合法时默认进入可视化设计器，结构异常时默认进入文本视图。
12. 浏览器刷新后恢复最近一次全局聊天历史与当前页面上下文，不恢复完整跨页已加载状态。

本轮明确排除的能力：

1. AI 自动新建页面。
2. 离开 DevSystem 后仍常驻显示的全局面板。
3. 跨刷新完整恢复所有跨页已加载上下文与多页撤销栈。

---

## 任务目标

把 DevSystem 收口为“DevSystem 内单一全局浮动 AI 面板 + 单一全局会话 + 默认单页读写、显式跨页编辑 + 页面级统一 undo / redo”的四文件统一编辑系统，并删除独立 Rule 工作区、独立 DataSet 入口与局部 AI 侧栏。

## 实施回写

### 已按计划落地

1. [src/views/app/dev-system/DevSystem.vue](../../../src/views/app/dev-system/DevSystem.vue)
  - 已删除 `dataset` / `rule` 工作区 tab。
  - 已挂载 DevSystem 作用域的全局浮动 AI 面板 [src/views/app/dev-system/components/DevFloatingAiPanel.vue](../../../src/views/app/dev-system/components/DevFloatingAiPanel.vue)。

2. [src/views/app/dev-system/DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue)
  - 已删除，旧文件级 AI 侧栏不再作为运行时入口。

3. [src/views/app/dev-system/DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue)
  - 已删除，旧独立 Rule 工作区已退出运行时链路。

4. [src/views/app/dev-system/DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue)
  - 已移除局部 AI 侧栏依赖。
  - `pagedata.json` 已收口为“可视化 / 文本”双视图，且已实现“结构合法默认可视化、结构异常默认文本”。

5. [src/views/app/dev-system/DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue)
  - 已支持在 DevSystem 文件页场景中隐藏内部 AI 面板。
  - 当前不再向全局浮动面板注册 pagedata AI sender/runtime；仅保留设计器视图自身的本地 AI 和 dirty 状态上报。

6. [src/views/app/dev-system/useDevState.ts](../../../src/views/app/dev-system/useDevState.ts)
  - 已新增 `readPageEditModel()`、`applyPageEditModel()`、`applyPageEditModelPatch()` 作为页面模型级状态读写入口。
  - 已补齐 `pageRuleDocument` / `pageDataDocument` 模型态绑定，AI 主链路不再直接以 `editFiles` / `applyPageFiles()` 作为宿主接口。
  - `script.js` / `style.css` 已补齐字符串模型绑定，状态层内部不再只把它们当作文件文本透传。
  - 已新增 `pageDataDesignerDirty` 状态，用于阻止浮层 AI 在设计器存在未导出本地改动时覆盖旧模型。
  - 已新增 AI 页面事务级 undo / redo 骨架，用于当前页面的 AI 写回事务回退。

7. [src/views/app/dev-system/composables/useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts)
  - 已改为直接消费 / 产出 `PageEditModel`，不再通过 `getContextFiles()` / `onApply(files)` 读写文件字符串。
  - 已改为复用统一的页面模型会话宿主 [src/views/app/dev-system/composables/usePageModelSessionHost.ts](../../../src/views/app/dev-system/composables/usePageModelSessionHost.ts)。
  - 已增加页面模型上下文签名；当 rule / pagedata / script / style 任一模型上下文变化时，会话会自动重建，避免旧会话继续基于过期文件快照运行。

8. [src/views/app/dev-system/composables/usePageDataEditSession.ts](../../../src/views/app/dev-system/composables/usePageDataEditSession.ts)
  - 已新增 pagedata 专用的模型级 AI 会话宿主，浮层直接通过该宿主执行 datasetTool.* 修改，不再依赖设计器组件注册 sender/runtime。
  - 会话输入与写回均直接基于 `PageEditModel` / `applyPageEditModelPatch()`。

9. [src/views/app/dev-system/components/DevFloatingAiPanel.vue](../../../src/views/app/dev-system/components/DevFloatingAiPanel.vue)
  - `pagedata.json` 分支已直接接入模型级 pagedata 会话宿主。
  - 已移除“等待 DataSet 设计器完成挂载”的旧占位逻辑，并在设计器存在未导出改动时显式 fail-fast 提示。

### 与计划不一致 / 低于预期的地方

1. **`useUnifiedEditSession` 尚未落地**
  - 计划：新增 [src/views/app/dev-system/composables/useUnifiedEditSession.ts](../../../src/views/app/dev-system/composables/useUnifiedEditSession.ts)，统一承载 Rule / DataSet / 4 文件会话。
  - 实际：本轮先落了共享宿主 [src/views/app/dev-system/composables/usePageModelSessionHost.ts](../../../src/views/app/dev-system/composables/usePageModelSessionHost.ts)，由 [src/views/app/dev-system/composables/useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts) 与 [src/views/app/dev-system/composables/usePageDataEditSession.ts](../../../src/views/app/dev-system/composables/usePageDataEditSession.ts) 共同复用 stills session/backend/context-signature 生命周期。
  - 影响：AI 会话底座已经统一到同一宿主规则，但宿主接口仍按 rule / pagedata 两个 composable 暴露，尚未进一步收敛为单一 `useUnifiedEditSession`。

2. **`pageHistoryStore` 尚未落地**
  - 计划：新增 [src/views/app/dev-system/composables/pageHistoryStore.ts](../../../src/views/app/dev-system/composables/pageHistoryStore.ts)，统一 AI 与手工编辑历史。
  - 实际：当前只是在 [src/views/app/dev-system/useDevState.ts](../../../src/views/app/dev-system/useDevState.ts) 内部新增 `pageEditTransactions`，并且仅记录 AI 事务；手工编辑仍沿用文件级文本历史。
  - 影响：已具备 AI 页面事务回退能力，但尚未达到“AI 与手工编辑共用同一页面历史栈”的计划目标。

3. **`DevDataSetDesigner.vue` 尚未降为纯视图组件**
  - 计划：删除独立 `fineEditSession` / `fineEditBackend` / AI 面板逻辑，仅保留 `pagedata.json` 可视化视图。
  - 实际：其内部仍保留 `fineEditSession`、`fineEditBackend`、`datasetFineEditOrchestration` 以及内嵌 AI sender；当前已不再承担全局浮层的 pagedata AI 宿主角色。
  - 新进展：其 4 文件上下文读取与最终写回已经切到 `PageEditModel` / `applyPageEditModelPatch()`；全局浮层的 pagedata AI 已改为独立模型会话宿主直连。
  - 影响：`pagedata.json` 的全局 AI 入口已不再依赖设计器挂载，但设计器自身尚未完全降为纯视图组件。

4. **跨页能力尚未实现到计划边界**
  - 计划：统一会话层应支持显式跨页编辑、按需加载其他页面四文件、并以页面事务回退。
  - 实际：本轮实现仅完成当前页面内的模型级统一写回与 AI 事务级撤销；显式跨页加载、跨页事务拆分、跨页恢复策略均未落地。

5. **验证深度低于计划**
  - 计划：补 `tests/devsystem-ai-global-session.test.ts`、`tests/devsystem-page-history.test.ts`、`tests/devsystem-pagedata-view-mode.test.ts` 并执行聚焦 Vitest。
  - 实际：本轮仅完成 `pnpm run typecheck` 与针对相关文件的 ESLint 校验，未新增或运行上述测试文件。

### 实际变更清单

#### 新增文件

- [src/views/app/dev-system/components/DevFloatingAiPanel.vue](../../../src/views/app/dev-system/components/DevFloatingAiPanel.vue)
  - 当前全局浮动 AI 面板宿主。
  - 已承载页面模型级编辑入口与当前页面 AI 事务 undo / redo 按钮。

- [src/views/app/dev-system/composables/usePageModelSessionHost.ts](../../../src/views/app/dev-system/composables/usePageModelSessionHost.ts)
  - Rule / pagedata 共用的 stills 会话宿主，集中管理 session/bootstrap/backend/context-signature 生命周期。

- [src/views/app/dev-system/composables/usePageDataEditSession.ts](../../../src/views/app/dev-system/composables/usePageDataEditSession.ts)
  - pagedata 浮层的模型级 AI 会话封装，直接读写页面模型。

#### 删除文件

- [src/views/app/dev-system/DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue)
- [src/views/app/dev-system/DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue)

#### 已修改核心文件

- [src/views/app/dev-system/DevSystem.vue](../../../src/views/app/dev-system/DevSystem.vue)
- [src/views/app/dev-system/DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue)
- [src/views/app/dev-system/DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue)
- [src/views/app/dev-system/useDevState.ts](../../../src/views/app/dev-system/useDevState.ts)
- [src/views/app/dev-system/composables/useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts)
- [src/views/app/dev-system/composables/usePageModelSessionHost.ts](../../../src/views/app/dev-system/composables/usePageModelSessionHost.ts)
- [src/views/app/dev-system/composables/usePageDataEditSession.ts](../../../src/views/app/dev-system/composables/usePageDataEditSession.ts)
- [src/views/app/dev-system/components/DevFloatingAiPanel.vue](../../../src/views/app/dev-system/components/DevFloatingAiPanel.vue)

### 实际验证

已执行：

1. `pnpm run typecheck`
2. 针对以下文件的 ESLint 聚焦校验：
  - [src/views/app/dev-system/components/DevFloatingAiPanel.vue](../../../src/views/app/dev-system/components/DevFloatingAiPanel.vue)
  - [src/views/app/dev-system/DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue)
  - [src/views/app/dev-system/composables/useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts)
  - [src/views/app/dev-system/composables/usePageModelSessionHost.ts](../../../src/views/app/dev-system/composables/usePageModelSessionHost.ts)
  - [src/views/app/dev-system/composables/usePageDataEditSession.ts](../../../src/views/app/dev-system/composables/usePageDataEditSession.ts)
  - [src/views/app/dev-system/useDevState.ts](../../../src/views/app/dev-system/useDevState.ts)

未执行：

1. 计划中的新增 Vitest 回归测试
2. 跨页编辑相关人工验证
3. 刷新恢复相关人工验证

### 下一阶段建议入口

1. 以 [src/views/app/dev-system/composables/useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts) 和 [src/views/app/dev-system/DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue) 为基座，真正抽出 `useUnifiedEditSession`，结束当前的双会话宿主过渡态。
2. 将 [src/views/app/dev-system/useDevState.ts](../../../src/views/app/dev-system/useDevState.ts) 中当前仅面向 AI 的 `pageEditTransactions` 升级为正式页面历史层，并把手工编辑并入同一事务模型。
3. 在统一会话层落地后，再补计划中的聚焦 Vitest 与跨页行为验证。

## 影响范围

### 删除文件

- [src/views/app/dev-system/DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue)
  - 删除独立 Rule 工作区与其专属 AI 入口。

- [src/views/app/dev-system/DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue)
  - 删除局部文件侧栏 AI，避免继续保留第二套入口。

### 新增文件

- [src/views/app/dev-system/components/DevFloatingAiPanel.vue](../../../src/views/app/dev-system/components/DevFloatingAiPanel.vue)
  - DevSystem 作用域内的全局浮动 AI 面板，承载聊天 UI、跨页提示状态、undo / redo 入口、显式跨页模式提示。

- [src/views/app/dev-system/composables/useUnifiedEditSession.ts](../../../src/views/app/dev-system/composables/useUnifiedEditSession.ts)
  - 统一全局会话宿主，取代当前 Rule 专用会话链；负责单会话、显式跨页模式、SSE 事件收口、导出与自动应用。

- [src/views/app/dev-system/composables/pageHistoryStore.ts](../../../src/views/app/dev-system/composables/pageHistoryStore.ts)
  - 页面级统一历史存储与撤销栈，承载 AI 与手工编辑混合历史。

### 修改文件

- [src/views/app/dev-system/DevSystem.vue](../../../src/views/app/dev-system/DevSystem.vue)
  - 删除 `dataset` / `rule` 工作区 tab。
  - 挂载 DevSystem 作用域的全局浮动 AI 面板宿主。
  - 保留 4 文件 tab、实时预览、节点属性等主工作区结构。

- [src/views/app/dev-system/DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue)
  - 移除对局部 AI 侧栏的依赖。
  - 暴露当前活动文件、当前页面、文件脏状态给统一面板与统一会话层。
  - 把 `pagedata.json` 收口为“文本 / 可视化”双视图容器，并实现“结构合法默认可视化、异常默认文本”的判定。

- [src/views/app/dev-system/DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue)
  - 删除独立 `fineEditSession` / `fineEditBackend` / AI 面板逻辑。
  - 仅保留 `pagedata.json` 可视化视图与投影状态管理。
  - 接入统一会话和统一页面历史，而不是直接自持写回链。

- [src/views/app/dev-system/useDevState.ts](../../../src/views/app/dev-system/useDevState.ts)
  - 提供页面级 4 文件快照读取与覆盖接口。
  - 新增显式跨页加载辅助能力，用于在明确跨页指令时按需拉取已有页面的 4 文件。
  - 与页面级历史存储联动，保证 AI 覆盖与手工编辑进入同一历史模型。

- [src/views/app/dev-system/composables/useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts)
  - 退役或转为兼容导出层；核心职责迁移到 `useUnifiedEditSession`。

- [src/views/app/dev-system/datasetFineEditOrchestration.ts](../../../src/views/app/dev-system/datasetFineEditOrchestration.ts)
  - 收缩为 dataset profile / prompt helper，不再承担独立会话编排。

- [src/views/app/dev-system/composables/textHistoryStore.ts](../../../src/views/app/dev-system/composables/textHistoryStore.ts)
  - 停止承担最终历史真源角色；要么降为文本局部缓存，要么将相关能力迁移到页面级历史存储。

- [packages/spark-ai/src/stills/edit-export-stills.ts](../../../packages/spark-ai/src/stills/edit-export-stills.ts)
  - 调整 UI 层使用方式：单页自动应用仍走 4 文件导出；显式跨页模式需要把导出结果拆分为按页面事务写回。

### 预计新增或修改的测试文件

- [tests/devsystem-ai-global-session.test.ts](../../../tests/devsystem-ai-global-session.test.ts)
  - 覆盖单会话、显式跨页开关、刷新恢复当前页面上下文。

- [tests/devsystem-page-history.test.ts](../../../tests/devsystem-page-history.test.ts)
  - 覆盖页面级统一 undo / redo、AI 覆盖本地脏改、按页面事务回退。

- [tests/devsystem-pagedata-view-mode.test.ts](../../../tests/devsystem-pagedata-view-mode.test.ts)
  - 覆盖 `pagedata.json` 的结构判定与默认视图切换。

## 技术方案

1. **入口硬切**
   - 在 [src/views/app/dev-system/DevSystem.vue](../../../src/views/app/dev-system/DevSystem.vue) 删除 `dataset` / `rule` tab。
   - 新增 DevSystem 作用域的全局浮动面板宿主。
   - 删除 [src/views/app/dev-system/DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue) 与 [src/views/app/dev-system/DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) 的引用入口。

2. **统一全局会话层**
   - 以当前 [src/views/app/dev-system/composables/useRuleEditSession.ts](../../../src/views/app/dev-system/composables/useRuleEditSession.ts) 为基础抽出 `useUnifiedEditSession`。
   - 单一会话在 DevSystem 生命周期内跨页面连续存在。
   - 默认只绑定当前页面真实读写；当用户明确下达跨页修改指令时，才进入显式跨页模式。
   - 刷新后恢复聊天历史与当前页面上下文，不恢复完整跨页工作集。

3. **收口 pagedata 视图与 AI 链路**
   - [src/views/app/dev-system/DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue) 成为 `pagedata.json` 的统一容器。
   - [src/views/app/dev-system/DevDataSetDesigner.vue](../../../src/views/app/dev-system/DevDataSetDesigner.vue) 降级为纯视图组件，不再自行创建 backend/session。
   - `datasetFineEditOrchestration` 只保留 dataset 聚焦的 profile / prompt 构造。

4. **建立页面级统一历史模型**
   - 新增页面级快照结构：以页面为单位同时记录四文件内容、来源动作、时间戳、事务编号。
   - AI 自动写回与手工编辑进入同一页面历史栈。
   - AI 覆盖本地脏改时，旧页面快照先入栈，再覆盖当前页面内容。
   - 同一轮 AI 若影响多个页面，按页面拆成多个 undo / redo 事务。

5. **显式跨页编辑链路**
   - 默认模式下只读取和写回当前页面。
   - 只有识别到用户明确跨页意图后，统一会话层才调用跨页加载能力，按需拉取任意已有页面的 4 文件。
   - 跨页模式下仍默认自动应用，但不得自动创建新页面。

6. **导出与应用统一**
   - 保持底层 stills 仍以四文件导出为核心。
   - UI 层根据目标页面拆分导出结果并执行页面级自动应用。
   - `dataset.export` 不再作为用户主协议，仅保留为兼容或内部能力。

### 关键设计决策及理由

1. **不把 AI 面板继续绑在 [src/views/app/dev-system/DevFileEditor.vue](../../../src/views/app/dev-system/DevFileEditor.vue) 内部**
   - 你已经明确要求“全局浮动面板”，所以局部侧栏方案直接出局。

2. **全局会话不等于默认跨页真实编辑**
   - 采用“全局记忆连续 + 显式跨页开关”可以同时满足连续对话与安全边界。

3. **跨页自动应用必须依赖页面级统一历史**
   - 否则无法满足“自动应用 + undo / redo + 覆盖本地脏改”的组合要求。

4. **删除旧入口而不是兼容并存**
   - 你的选择是硬切收口，不做长期双入口并存；因此计划以删除旧入口为目标，而不是套兼容壳。

## 兼容性

### 对现有功能的影响分析

- 正向收益：
  - 消除 Rule / DataSet / 文件侧栏三套 AI 并存问题。
  - 消除 Rule 会话和 DataSet 会话分裂问题。
  - 让 `pagedata.json` 可视化编辑、文本编辑、AI 编辑回到同一文件视图。
  - 建立页面级统一 undo / redo，为 AI 自动应用提供可回退边界。

- 明确破坏性变更：
  - 删除 [src/views/app/dev-system/DevRuleEditor.vue](../../../src/views/app/dev-system/DevRuleEditor.vue) 独立工作区。
  - 删除 [src/views/app/dev-system/DevSystem.vue](../../../src/views/app/dev-system/DevSystem.vue) 中独立 DataSet tab。
  - 删除 [src/views/app/dev-system/DevEditorAiBar.vue](../../../src/views/app/dev-system/DevEditorAiBar.vue) 局部 AI 侧栏。
  - 旧的 dataset 独立会话链与 Rule 独立会话链不再保留为主路径。

### 兼容边界

1. 刷新恢复仅覆盖聊天历史与当前页面上下文，不承诺恢复完整跨页工作集。
2. 跨页编辑只作用于当前项目中已有页面，不自动创建新页面。
3. 全局浮动面板的可见范围限定在 DevSystem 内，不扩散到整个应用其他区域。

## 验证计划

### 需要运行的检查

1. 先跑新增或更新的聚焦 Vitest：
   - `pnpm run test -- -t "devsystem ai global session"`
   - `pnpm run test -- -t "devsystem page history"`
   - `pnpm run test -- -t "devsystem pagedata view"`
2. `pnpm run typecheck`
3. `pnpm run lint`
4. 如 Windows 下 verbose Vitest 出现 `EnvironmentTeardownError` 噪音，再用 `pnpm run test:run` 复核一次。

### 需要人工验证的关键场景

1. DevSystem 中不再出现独立 Rule tab 与 DataSet tab。
2. 全局浮动 AI 面板只在 DevSystem 内可见，离开 DevSystem 不显示。
3. 在当前页面内让 AI 同时改四个文件，改动自动应用且能按页面撤销。
4. 当前页面存在未保存手工改动时，AI 自动写回直接覆盖，但能通过页面级 undo 恢复覆盖前状态。
5. 明确发出跨页修改指令时，系统能自动加载已有目标页面并应用改动；未发出跨页指令时，系统只改当前页面。
6. 刷新浏览器后，聊天历史与当前页面上下文恢复，但不会无条件恢复完整跨页工作集。
7. `pagedata.json` 结构合法时默认进入可视化设计器，结构异常时默认进入文本视图。

## 风险项

1. **全局会话与显式跨页模式判定错误**
   - 风险：模型误把普通对话识别为跨页修改请求，导致意外拉取其他页面。
   - 缓解：显式跨页模式必须依赖稳定的意图判定与清晰的 UI 提示，不满足条件时 fail-fast。

2. **统一历史与编辑器原生局部撤销冲突**
   - 风险：页面级统一历史与文本编辑器原生局部撤销可能产生认知冲突。
   - 缓解：页面级 undo / redo 作为页面内容真源；局部编辑器撤销仅保留为输入态辅助，不再视为最终状态边界。

3. **AI 覆盖本地脏改带来误操作感知**
   - 风险：自动应用策略可能让用户感知“AI 抢写”。
   - 缓解：面板必须明确展示本轮写回目标页面，并提供立即可见的页面级 undo / redo 入口。

4. **刷新恢复范围有限**
   - 风险：用户可能误以为刷新后完整跨页工作集也会恢复。
   - 缓解：在面板恢复提示中明确说明本轮仅恢复聊天历史与当前页面上下文。

---

## 历史说明

1. 本文最初为审核版计划书。
2. 用户已明确批准“开工”，因此本文现同时承担“计划基线 + 实施差异回填”的角色。
3. 后续若继续推进统一会话层与页面级统一历史，应在本文的“实施回写”基础上继续更新，而不是再开一份平行计划书。