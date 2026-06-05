# src 目录约定

```text
model/          领域 class（包主语）；含 serialization/ 纯解析；ports.ts 定义 IO 端口类型
facade/         ProjectEditor 薄编排 + 协作者 + EditorSession（门面实例）
factory/        组合根（createBareProjectModel、PageNodeFactory、LoadedPageNode）
io/             HTTP/文件/loader 适配；page-content-repository 四文件持久化
index.ts        导出 model + factory + compiler + page-data 规范化
project.ts      导出 facade + 落盘 DTO
```

依赖：`facade → {model, factory, io}`、`io → model`、`factory → {model, io}`。**禁止 `model → io`**。

**模型 vs 实例**：`ProjectModel` / `ConfigPageNode` 是纯领域类型；`createBareProjectModel` 产出领域实例；`PageContentRepository`（io/）负责四文件持久化；`createProjectEditor` 产出门面实例；`LoadedPageNode`（factory/）= 领域页 + repository，供渲染管线 `PageNodeLike.load`。

DevSystem 设计器制品（rule schema、DataSet 画布投影）在应用层 `src/services/project-model-artifacts/`，不进入本包。

## facade 协作者

| 文件 | 职责 |
|------|------|
| `project-editor.ts` | 对外 API 编排 |
| `editor-session.ts` | 选中、activePage、dirty、working DTO、revision |
| `navigation-editor.ts` | 导航编辑与 reload |
| `page-file-editor.ts` | 页面内容读写、undo/redo、结构化编辑（editDataSet/editNodeTree）、加载/保存/版本 |
| `page-lifecycle.ts` | 页面挂载/创建/删除 |
| `editor-snapshot.ts` | `readSnapshot` / `readProjectModelDto` |
| `reference-query.ts` | 跨项目引用、外链探测 |

## 新增文件规则

- 导航/页面/项目 class → `model/` 对应子目录
- 字符串→DataSet/SparkNode 纯函数 → `model/serialization/`
- 调 API、写文件、loader → `io/`
- 装配 HTTP + ProjectModel → `factory/`
- 面向 DevSystem/AI 的编排 → `facade/`
- DevSystem 编辑器 schema/投影 → 应用层 `src/services/project-model-artifacts/`
- 跨包稳定类型 → 从 `index.ts` 或 `project.ts` 再导出
