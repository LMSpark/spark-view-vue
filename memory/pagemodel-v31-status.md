---
name: pagemodel-v31-status
description: PageModel V3.1 主线整改完成状态和剩余非阻塞债务
metadata:
  type: project
---

PageModel V3.1 主线整改已完成并通过全量验证（2026-05-28）。

## 已完成的 P0 项

### P0-1 文件页签只读投影
- `useDevFileEditor.ts` 删除 draft/commit 体系，text 直接从 `state.getPageFileText()` 读取
- `DevFileEditor.vue` 文本编辑器全部 readonly，结构化编辑器保留（JsonTreeEditor / DevDataSetDesigner）

### P0-2 导航表单直连 page.navigation
- `navDraft` reactive adapter 代理到 `page.navigation` getter/setter
- 删除 `editForm` / `hasContext` / `contextItems` / `contextConfig` 旧影子拷贝
- context 写穿：`syncContextToNav()` 在 v-model 变更时立即同步到 `page.navigation`

### P0-3 导航保存统一走子模型
- `saveAll()` / `saveSelectedNavigationNode()` 优先使用 `page.navigation.applyToNode()` 生成 patch
- P0-4 snapshot dirty 语义修正：`readSnapshot().navigationDirty` 聚合 `this.navigationDirty || page.navigation.isDirty`

### P0-4 refreshNavRefs 接入
- `reloadNavigation()` 末尾调用 `this.refreshNavRefs()`，打开中的 PageModel 在 reload 后自动重绑 navNode

## 验证结果
- typecheck: 0 errors
- lint: 0 errors
- test: 125 files / 1081 tests pass

## 剩余非阻塞债务
- `PageEditor.applyNavigationDraft()` 仍直连 raw node `applyNavigationNodeDraftToNode()`，未走 `page.navigation.applyDraft/applyContext/applyToNode()`
- 当前 src/ 中无生产消费方（仅 spark-ai 测试在用）
- 后续应删除或改为完全委托 page.navigation
