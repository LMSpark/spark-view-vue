# 工具目录索引

`tools/` 存放少量面向工程体系的辅助工具，通常被构建、验证或本地开发流程调用。

## 当前内容

- `vite-plugin-spark-components.ts`：构建期组件元数据提取工具。
- `verify-architecture.mjs`：结构约束校验工具。
- `verify-ai-codegen-rules.mjs`：AI 代码生成硬门禁，禁止游离 interface、机械 `Interface/Impl` 命名、非 `as const` 类型断言、旧 AI API、TypeScript namespace、公共 `export *`，并限制 named import 与公共入口平铺导出继续膨胀。
- `verifier-common.mjs`：校验器共享扫描层，统一处理 TS/Vue script、导入解析、排除目录和错误输出。
- `mock-config-api.mjs`：本地调试用的配置 API mock。

## 验证入口

- `pnpm run verify:arch`：包依赖、跨包相对导入、框架无关包、`spark-ai` 公共 subpath 边界。
- `pnpm run verify:ai-codegen`：AI 代码生成规则。
- `pnpm run verify:rules`：同时执行架构边界与 AI 生成规则；根 `verify` 已接入该入口。

## 与 scripts 的边界

- `scripts/` 偏向“可执行流程”。
- `tools/` 偏向“被流程调用的辅助工具或校验器”。

如果一个文件主要职责是驱动一段维护流程，放 `scripts/`；如果主要职责是被构建或验证流程复用，放 `tools/`。
