# Word 需求导入合并到项目策划研读记录

## 用户确认

用户要求“合并到 projectPlanning”，并以“开工”确认进入后续流程。本记录用于承接阶段 1 的源码研读结论，后续方案和实施只以结构化持久层文件为锚点，不依赖聊天记录。

## 已读文档与知识

- `docs/ai/AI_CODE_CHANGE_PROTOCOL.md`
- `docs/ai/ai-code-generation-behavior.md`
- `docs/ai/AI_MODEL_SPEC.md`
- `docs/ai/spark-ai-workflow.md`
- `knowledge/README.md`
- `knowledge/class-model-system.md`
- `knowledge/monorepo-dependencies.md`
- `knowledge/page-design.md`
- `knowledge/testing.md`
- `knowledge/vue-frontend.md`
- `notes/research-business-factory-agent-workflow.md`
- `notes/plan-business-factory-agent-workflow.md`

## 现有链路事实

### Word 需求导入链路

- `src/services/requirement-import/docx-parser.ts` 负责 `.docx` 文件解析，使用 `mammoth.extractRawText({ arrayBuffer })` 输出纯文本。
- `src/views/app/dev-system/RequirementImportDialog.vue` 提供 DevSystem 弹窗 UI，允许选择或拖拽 `.docx`，展示解析状态和文本预览。
- `src/views/app/dev-system/useDevState.ts` 当前导入 `runRequirementImportAiSession` 和 `parseDocxToText`，把解析后的文本存为 `requirementImportDocumentText`。
- `runRequirementImportAi()` 当前调用 `runRequirementImportAiSession({ documentText, projectName, editor, ... saveNavigationAfterRun: true })`。
- `src/services/requirement-import/requirement-import-ai-runner.ts` 组装 `RequirementImportAgentInput`，调用 `AiAgentHost.run('requirementImport', input)`，运行结束后通过 `createRequirementImportInlineDeliveryPort()` 保存 navigation。
- `src/services/requirement-import/requirement-import-business.ts` 的业务本质是 ProjectModel 导航策划：要求 LLM 查询 `readProjectPlanningInput`、`readNavigationPlanningInputs`、`replaceNavigationChildren`，完成门禁为 `completeProjectPlanning`。
- `src/services/requirement-import/requirement-import-host-run-provider.ts` 为 SSE Host Run 暴露 `requirementImport` alias，输入字段是 `documentText`。

### projectPlanning 链路

- `src/services/project-planning/project-planning-business.ts` 已有 `PROJECT_PLANNING_AGENT_WORKFLOW_PROCESS` 六段式工艺流程图，F0-F9 是各阶段内的检查维度，不作为流程节点。
- `ProjectPlanningRunInput` / `ProjectPlanningAgentInput` 已支持 `planningAttachmentText` 和节点级 `navigationAttachmentTextByNodeId`。
- `resolveProjectPlanningRunInput()` 会读取 `ProjectModel.readProjectPlanningInput()` 和 `readNavigationPlanningInputs()`，并把调用方传入的 `planningAttachmentText` 注入 agent input。
- `createProjectPlanningSystemPrompt()` 通过 `formatProjectPlanningPromptContext()` 把 `projectPlanningAttachmentText` 写入 prompt。
- `src/services/project-planning/project-planning-ai-runner.ts` 统一入口是 `runProjectPlanningAiSession()`，调用 `AiAgentHost.run('projectPlanning', input)`，运行结束后通过 `createProjectPlanningInlineDeliveryPort()` 保存 navigation。
- `src/services/project-planning/project-planning-host-run-provider.ts` 已支持 Host Run 参数 `planningAttachmentText`，并归一化到 `projectPlanning` input。
- `App.vue` 当前同时把 `prepareProjectPlanningHostRun` 和 `prepareRequirementImportHostRun` 挂入 `chainAiHostRunPrepare()`。

## 结论

`requirementImport` 与 `projectPlanning` 的领域落点重复：两者都只写 `ProjectModel.navigationRoot`，都禁止进入 pageDesign 四文件，都通过 `completeProjectPlanning` 完成。区别主要是输入字段与 alias：

- `requirementImport`：`documentText`，alias 为 `requirementImport`。
- `projectPlanning`：`requirement` + `planningAttachmentText`，alias 为 `projectPlanning`。

合并的合理方向是保留 Word 解析能力，但把解析后的正文作为 `planningAttachmentText` 注入 `projectPlanning`，让“需求文档 -> 项目策划”使用同一个 projectPlanning 工艺流程和同一个业务注册。

## 影响范围候选

最小主路径合并可能涉及：

- `src/views/app/dev-system/useDevState.ts`
- `src/views/app/dev-system/RequirementImportDialog.vue`
- `src/views/app/dev-system/DevSystem.vue`
- `src/views/app/dev-system/DevSiteTree.vue`
- `src/services/requirement-import/docx-parser.ts`
- `src/services/project-planning/project-planning-ai-runner.ts`
- `src/services/project-planning/project-planning-host-run-provider.ts`
- `src/App.vue`
- `tests/services/project-planning-ai-runner.test.ts`
- `tests/services/project-planning-host-run-provider.test.ts`
- `tests/services/agent-workflow-business.test.ts`
- 可能新增或调整 DevSystem 相关测试

如果完全删除独立 requirementImport，则还会涉及删除：

- `src/services/requirement-import/requirement-import-business.ts`
- `src/services/requirement-import/requirement-import-ai-runner.ts`
- `src/services/requirement-import/requirement-import-host-run-provider.ts`
- `src/services/requirement-import/requirement-import-headless.ts`

## 约束与风险

- 修改生产代码前必须完成复杂度分级、反向提问、方案计划书和用户审核。
- 不能引入新依赖；`mammoth` 已存在于根 `package.json`。
- 不修改 `pnpm-lock.yaml`。
- 不把 Word 解析放入 `packages/spark-project-model`，因为 `File` / `mammoth` 属于 app/service 层，不应污染模型包。
- 若删除 `requirementImport` alias，可能破坏已有后端/SSE 请求方；如果需要兼容，应设计旧 alias 到 `projectPlanning` 的过渡策略。
- 修改模型 class 或 JSDoc 时需要重新生成 `generated/dts-class-model/`；本任务若只动 app service/UI，不需要生成。
- 当前工作树已有与项目策划工艺流程相关的未提交改动，实施前必须重新确认 `git status`、运行 `pnpm run typecheck` 基线。
