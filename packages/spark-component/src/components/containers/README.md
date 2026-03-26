# containers

容器层 composable 现在按职责分组：

1. `actions/`：容器动作区逻辑，如主操作、侧边操作
2. `context/`：上下文数据、模块上下文、数据作用域、表单详情态
3. `data/`：DataSource 解析与副作用绑定
4. `layout/`：栅格、插槽、工具栏、过滤区
5. `data-components/`：直接依赖 DataSet / DataView 的 Vue 容器组件
6. `non-data-components/`：布局、分步、折叠、弹层等非数据核心容器
7. `data-components/composables/`：主要服务于数据容器组件的组合函数主入口
8. `non-data-components/composables/`：主要服务于非数据容器组件的组合函数主入口
9. `data-components/support/`：内置动作、权限判断、slot scope 工厂等辅助 TS 主入口

优先入口：

1. `composables.ts`
2. 需要细分时使用 `containerActionComposables`、`containerContextComposables`、`containerDataComposables`、`containerLayoutComposables`
3. 查 Vue 组件时优先看 `containerDataComponents` 和 `containerNonDataComponents`
4. 查和 Vue 分组对齐的组合函数时优先看 `data-components/composables/` 和 `non-data-components/composables/`
5. 只想记短名字时可用 `containerDataUi`、`containerNonDataUi`、`containerDataUiComposables`、`containerNonDataUiComposables`