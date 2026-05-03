# components

组件层分成五块：

1. `containers/`：表格、表单、详情、树、对话框等容器 renderer
2. `display/`：统计、标签、时间线、告警等展示 renderer
3. `fields/`：字段 renderer 和字段级 composable
4. `support/`：跨组件支撑能力
   - `support/ai/`：AI 会话、面板、启动器与缓存
   - `support/editors/`：代码/JSON/树形编辑器
   - 根层仅保留渲染器辅助、行同步、选择路径、未注册兜底
5. 根目录入口：`index.ts`、`internal.ts`、`register-renderers.ts`

推荐查找顺序：

1. 先看对应领域的 `index.ts`
2. 容器共享组合函数在 `containers/composables/`
3. 字段共享组合函数在 `fields/context/`、`fields/options/`、`fields/data-components/composables/`
4. 支撑组件按 feature 进入 `support/ai/` 或 `support/editors/`

命名约定：

1. `actions`：交互动作、按钮行为、弹窗能力、选择器能力
2. `context`：上下文解析、能力消费、权限态、数据作用域
3. `data`：DataView / DataSource 编排
4. `layout`：栅格、插槽、工具栏、过滤区布局
5. `options`：下拉、多选、级联等选项解析与格式化
6. `support`：为对应分组 Vue 组件服务的辅助 TS 工具入口
