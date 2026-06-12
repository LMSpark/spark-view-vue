# spark-project-model 代理说明

## 模型语义

**模型 = class + API（事件）**。`ProjectModel` 是根；谁 `new` 谁负责生命周期。

## 目录

```text
src/index.ts
src/project/
src/navigation/
src/page/           compile-files、canonicalize-page-data、content/*
src/io/
```

## 边界

- 存储真源：DB navigation + 四文件。
- `ProjectModel.session`（选中/dirty）不落盘。
- 无 Vue/DOM/Router。
- 设计 API → `ProjectModel`；落盘 → `ProjectWorkspace`。
- 只有 `@spark-appworks/spark-project-model` 一个公开入口，不新增子入口或 barrel 中转层。

## 验证

```bash
pnpm --dir packages/spark-project-model run typecheck
pnpm --dir packages/spark-project-model run test:run
```
