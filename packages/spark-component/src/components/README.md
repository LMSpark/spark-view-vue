# components

组件层分成三块：

1. `containers/`：表格、表单、详情、树、对话框等容器 renderer
2. `fields/`：字段 renderer 和字段级 composable
3. 根目录入口：`index.ts`、`internal.ts`、`composables.ts`

推荐查找顺序：

1. 先看 `composables.ts`
2. 再看 `containerComposables` / `fieldComposables`
3. 需要更细粒度时，进入 `containerActionComposables`、`containerLayoutComposables`、`fieldContextComposables`、`fieldActionComposables` 等子命名空间
4. 查 Vue 组件时，优先使用 `containerDataComponents`、`containerNonDataComponents`、`fieldDataComponents`、`fieldNonDataComponents`
5. 查与 Vue 分组对齐的组合函数时，优先使用 `containerDataComponentComposables`、`containerNonDataComponentComposables`、`fieldDataComponentComposables`、`fieldNonDataComponentComposables`
6. 若只想记短名字，可用别名：`containerDataUi`、`containerNonDataUi`、`fieldDataUi`、`fieldNonDataUi`，以及对应的 `*UiComposables`

命名约定：

1. `actions`：交互动作、按钮行为、弹窗能力、选择器能力
2. `context`：上下文解析、能力消费、权限态、数据作用域
3. `data`：DataView / DataSource 编排
4. `layout`：栅格、插槽、工具栏、过滤区布局
5. `options`：下拉、多选、级联等选项解析与格式化
6. `*-support`：为对应分组 Vue 组件服务的辅助 TS 工具入口