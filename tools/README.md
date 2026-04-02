# 工具目录索引

`tools/` 存放少量面向工程体系的辅助工具，通常被构建、验证或本地开发流程调用。

## 当前内容

- `vite-plugin-spark-components.ts`：构建期组件元数据提取工具。
- `verify-architecture.mjs`：结构约束校验工具。
- `mock-config-api.mjs`：本地调试用的配置 API mock。

## 与 scripts 的边界

- `scripts/` 偏向“可执行流程”。
- `tools/` 偏向“被流程调用的辅助工具或校验器”。

如果一个文件主要职责是驱动一段维护流程，放 `scripts/`；如果主要职责是被构建或验证流程复用，放 `tools/`。