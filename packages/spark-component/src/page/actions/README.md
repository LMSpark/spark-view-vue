# page/actions

页面声明式动作层：

1. `action-types.ts`：动作描述符类型定义
2. `action-control.ts`：默认行为控制器提取与传播辅助
2. `action-executor.ts`：动作执行引擎
3. `index.ts`：动作层统一入口

适用场景：

1. `rule.json` 中的 `on` 事件
2. 容器区域子节点（如 `r-toolbar` / `r-header` / `r-footer`）
3. 用配置代替脚本函数的零代码交互

统一语义：

1. 组件默认行为 = A
2. action descriptor / 业务处理 = B
3. `{ cancel: boolean }` 控制器 = C

`cancelDefault: true` 不再由绑定层直接篡改事件参数，而是由 `action-executor.ts`
在执行 descriptor 时显式设置 `control.cancel = true`，并继续向 `then / onConfirm / onCancel`
链路透传，和容器/字段事件的 A/B/C 模型保持一致。