# 模型层级

**设计即编辑**；**模型 = class + API（事件）**；谁 `new` 谁负责生命周期。

```text
ProjectModel
├── design: ProjectDesign       # 导航树 + ConfigPageNode Map
├── session: ProjectSession     # 选中 / activePage / dirty（不落盘）
└── 事件 subscribe / 投影 read*Projection()

ProjectNode（navigation/project-node + navigation/navigation-kinds）
├── ModuleNode / SystemDirectoryNode / LinkNode / RefNode / …
└── ConfigPageNode（page/config-page）
    ├── PageRuleFile / PageDataSetFile / PageTextFile（page/content/*）
    └── ConfigSubPageNode

ProjectWorkspace                    # 持有 .project + IO（非 host 层）
PageContentLoader + runtime-page    # 运行态四文件加载
```

`ProjectNodeData` 等 type 仅用于 API 载荷与落盘映射，不是第二套模型。
