# 研读：修复 dev-state / dev-system-header-save 失败测试

## 任务来源

`pnpm run test:all` 有 10/1224 失败，用户要求"修复或者删除没通过的 test"。

## 失败现象

### A. `tests/dev/dev-state-page-file-closed-loop.test.ts`（8 个失败）

错误：`TypeError: projectPlanningAdapter.subscribe is not a function`
抛出位置：`src/views/app/dev-system/useDevState.ts:465`，由 `tests/dev/dev-state-test-fixture.ts:84` 的 `createDevStateWithConfigPages()` → `useDevState()` 触发。

8 个用例均在构造 state 阶段失败，未进入实际断言：
1. 缺失 script/style 时 fail-fast
2. 缺失 rule/pagedata 时 fail-fast
3. 版本 createdAt 归一化
4. restore 后强制重读回填
5. 切换节点触发 navEditDto 订阅刷新
6. 初始化页面列表从导航树派生
7. header 保存只提交选中节点 patch
8. 跨租户项目编辑保存

### B. `tests/dev/dev-system-header-save.test.ts`（2 个失败）

错误：`Cannot read properties of undefined (reading 'value')`
位置：`src/views/app/dev-system/DevSystem.vue:162`，读取 `state.projectPlanningDocumentImportDialogVisible.value`。
原因：测试 fixture `createDevSystemCtx()`（第 13-61 行）未提供 `projectPlanningDocumentImportDialogVisible` 等 `projectPlanning*` 状态字段，DevSystem 渲染即崩溃。

## 根因（git 历史核实）

- 测试文件最后改动：`e7fe91d4f refactor(spark-project-model): converge on ProjectWorkspace`
- 源码后续重构：`c6d378618 feat(spark-ai): merge planning document import`
  - `useDevState.ts` 新增 `projectPlanningAdapter = createAiRunAdapter()`，并在构造期调用 `projectPlanningAdapter.subscribe(...)`（465 行）和 `projectPlanningAdapter.snapshot()`（462 行 computed）
  - `DevSystem.vue` 新增 `ProjectPlanningDocumentImportDialog`，模板引用 `state.projectPlanningDocumentImportDialogVisible.value` 等新状态
- 测试 fixture 未同步更新 → 预存问题，非依赖升级引入

## 源码契约核实

### 真实 `createAiRunAdapter()` 返回（`packages/spark-app/src/ai/ai-run-adapter.ts:305-311`）

```ts
return {
  isRunning,
  abort,
  snapshot,
  subscribe,
  run,
}
```

### 测试 mock 返回（`dev-state-page-file-closed-loop.test.ts:38-42`）

```ts
createAiRunAdapter: vi.fn(() => ({
  isRunning: vi.fn(() => false),
  abort: vi.fn(),
  run: vi.fn(async () => 'completed' as const),
})),
```

缺失：`snapshot`、`subscribe`。

### `useDevState.ts` 对 adapter 的使用

- `pageDesignAiAdapter.isRunning()`（441、646 行）— mock 已提供
- `projectPlanningAdapter.snapshot().timeline...`（462 行）— mock 缺失
- `projectPlanningAdapter.subscribe(...)`（465 行）— mock 缺失
- `projectPlanningAdapter.isRunning()`（736 行）— mock 已提供

### `DevSystem.vue` 模板对新状态的引用

- `state.projectPlanningDocumentImportDialogVisible.value`（162 行）— header-save fixture 缺失，渲染即崩
- 其他 `projectPlanning*` 字段由 `ProjectPlanningDocumentImportDialog` 子组件使用（被 stub 或不触发，不阻塞挂载）

## 被测功能是否仍有效

- A 的 8 个用例：覆盖页面文件 fail-fast、版本归一化、restore 回填、navEditDto 订阅、页面列表派生、header patch 保存、跨租户编辑。这些是 `useDevState` 的核心闭环行为，源码仍在，功能有效——只是 fixture 的 adapter mock 落后。
- B 的 2 个用例：覆盖 header 保存按钮触发 saveAll、AI 工具审批面板挂载与事件。DevSystem.vue 仍在，功能有效——只是 fixture 缺少新状态字段。

结论：两组测试覆盖的功能均仍有效，问题在 fixture 与源码重构脱节，应**修复 fixture**而非删除测试。

## 影响面

- 修改仅限两个测试文件（+ 可能的 fixture 文件）：
  - `tests/dev/dev-state-page-file-closed-loop.test.ts`：补 `createAiRunAdapter` mock 的 `subscribe` 和 `snapshot`
  - `tests/dev/dev-system-header-save.test.ts`：补 `createDevState` 缺失的 `projectPlanning*` 状态字段
- 不触碰任何源码
- 不影响其他测试（mock 是测试文件内 `vi.mock` 局部的）

## 验证计划

- `pnpm vitest run tests/dev/dev-state-page-file-closed-loop.test.ts tests/dev/dev-system-header-save.test.ts`
- `pnpm run test:all`（必须 0 失败）
- `pnpm run typecheck`
- `pnpm run lint`
