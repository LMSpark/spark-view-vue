---
description: "编写或更新 Vitest 测试、回归测试、集成测试，或在 SPARK 前后端变更后选择验证命令时使用。覆盖测试位置、窄验证顺序、Spark 测试隔离和 Windows Vitest 已知任务噪声。"
name: "SPARK 测试与验证指南"
applyTo: "tests/**, packages/**/src/tests/**, **/*.test.ts"
---

# SPARK 测试与验证指南

新增或编辑测试，以及决定代码变更后运行哪些验证时使用本说明。

## 把测试放在正确位置

- `tests/**` 用于根应用集成、跨包回归、路由/导航/权限/协议对齐，以及其他 workspace 级运行时约束。
- 包内行为测试放在所属包的测试目录，通常是 `packages/**/src/tests/**`。
- 测试命名按行为或回归目标，不按实现细节。
- 如果 bug 跨包，优先在 `tests/**` 增加回归测试，不要在多个包里重复窄单测。

## 验证顺序

- 先运行最便宜、且能推翻当前改动的检查。
- 全量验证前，优先运行聚焦的 Vitest 文件或测试名。
- 前端 TypeScript 或 Vue 变更需运行 `pnpm run typecheck`，除非触及范围仅是测试。
- 共享 TS/Vue 逻辑变更或新增代码路径时运行 `pnpm run lint`。
- 涉及 Spring 或 API 影响的后端变更运行 `cd spark-ai-server && mvn test`。
- 只有窄范围稳定后，再使用 `pnpm run test:run`、`pnpm run test:packages:run` 或 `pnpm run verify` 等更宽命令。

## 常用命令

- `pnpm run test`
- `pnpm run test:run`
- `pnpm run test -- -t "name"`
- `pnpm run typecheck`
- `pnpm run lint`
- `cd spark-ai-server && mvn test`

## SPARK 测试模式

- 隔离运行时状态。每个测试文件或 describe block 优先使用 `Spark.createSystem()` 或全新的 registry/plugin 设置。
- Vue mount 测试中，安装 `Spark.createPlugin()` 或显式提供组件期望的 registry/root context。
- 能力测试应使用 `sparkProvide` / `sparkConsume`，并直接断言父链查找。
- 数据测试应通过真实公共 API 覆盖 `DataSet`、`DataView` 和 DataViewKey 辅助工具，不要围绕内部行为重写 mock。
- 只在测试需要的模块边界 mock 外部 UI 库。

## 仓库特定默认值

- 渲染器、DataViewKey、导航、权限、CRUD bridge 和协议对齐问题优先写回归测试；本仓库依赖这些测试保护运行时契约。
- 修复属于某个包但影响跨包行为时，应在行为被强制约束的位置添加回归测试，不只在代码修改处添加。
- 行为断言更清晰、更易维护时，不要添加宽泛 snapshot 测试。

## Windows Vitest 说明

- Windows 上 verbose Vitest 任务输出偶尔会把 `EnvironmentTeardownError: Closing rpc while onUserConsoleLog was pending` 报成任务噪声。
- 如果出现该信息，先用 `pnpm run test:run` 复跑，再判断是否是真失败。
- 如果复跑干净且没有剩余 `Errors`，将原 verbose 任务失败视为工具噪声，而不是产品回归。

## 文档

- `docs/guides/TESTING_BEST_PRACTICES.md` — SPARK 测试模式和示例
- `tests/README.md` — 根级测试范围和放置规则
- `package.json` — 标准验证命令
