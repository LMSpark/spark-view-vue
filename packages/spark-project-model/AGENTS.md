# spark-project-model 代理说明

## 模型语义

**模型 = class + API（事件）**。`ProjectModel` 是根；谁 `new` 谁负责生命周期。

## 目录

```text
model/project|navigation|page|serialization/
io/
project-workspace.ts
project.ts / index.ts
```

## 边界

- 存储真源：DB navigation + 四文件。
- `ProjectModel.session`（选中/dirty）不落盘。
- 无 Vue/DOM/Router。
- 设计 API → `ProjectModel`；落盘 → `ProjectWorkspace`。

## 验证

```bash
pnpm --dir packages/spark-project-model run typecheck
pnpm --dir packages/spark-project-model run test:run
```
