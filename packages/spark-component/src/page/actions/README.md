# page/actions

页面声明式动作层：

1. `action-descriptor.ts`：动作描述符类型定义
2. `action-executor.ts`：动作执行引擎
3. `index.ts`：动作层统一入口

适用场景：

1. `rule.json` 中的 `on` 事件
2. 容器 `toolbar` / `rowActions`
3. 用配置代替脚本函数的零代码交互