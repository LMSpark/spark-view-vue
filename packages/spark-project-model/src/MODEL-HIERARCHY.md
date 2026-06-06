# 模型层级

**设计即编辑**；**模型 = class + API（事件）**；谁 `new` 谁负责生命周期。

```text
ProjectModel
├── design: ProjectDesign       # 导航树 + ConfigPageNode Map
├── session: ProjectSession     # 选中 / activePage / dirty（不落盘）
└── 事件 subscribe / 投影 read*Projection()

navigation/
├── ProjectNode（project-node）
├── *Node kind 子类（navigation-kinds，不含 ConfigPageNode）
├── navigation-tree / navigation-edit

page/
├── ConfigPageNode / ConfigSubPageNode
├── instantiate-project-node    # 统一 nodeKind → class
└── content/* 四文件子 class

ProjectWorkspace                # 持有 .project + IO
PageContentLoader + runtime-page
```

`ProjectNodeData` 等 type 仅用于 API 载荷与落盘映射，不是第二套模型。
