# containers

容器层按“公开组件 / 内部支撑 / 组合函数”分层：

1. `data-components/`：DataView-first 容器组件（table / form / detail / tree / list / row-fragment）
2. `non-data-components/`：布局与交互型容器组件（section / dialog / drawer / tabs / steps 等）
3. `context/`：容器上下文与模块上下文（如 form/detail 的组合态）
4. `layout/`：网格、插槽、工具栏等布局辅助
5. `composables/`：可复用组合函数（容器动作与数据源解析）
6. `support/`：内部桥接与工具（host/row scope、CRUD helpers、action helpers、slot scope）

实践约束：

1. 公开可配置容器优先放到 `data-components/` 与 `non-data-components/`
2. 内部桥接组件与纯工具函数统一放到 `support/`
3. `use*` 组合函数统一放到 `composables/`，避免根目录混放