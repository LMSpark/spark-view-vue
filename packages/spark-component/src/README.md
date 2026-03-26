# src

根目录现在按“公开入口 + 分组入口”组织：

1. `index.ts`：公共 API 根入口
2. `core/`：基础内核分组入口
3. `system/`：Spark 命名空间、插件、注册表
4. `components/`：组件层
5. `page/`：页面编排层
6. `internal/`：内部便利入口

说明：

1. kernel 真实实现已全部下沉到 `core/`
2. 外部消费优先使用 `index.ts`
3. 包内实现优先根据职责进入 `core/`、`system/`、`components/`、`page/`、`internal/`