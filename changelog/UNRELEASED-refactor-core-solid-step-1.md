# Unreleased — refactor/core-solid-step-1-singletons

**Summary**

DI-first 重构：移除全局 Provider（GlobalProviderRegistry），采用 Symbol DI (`SPARK_MANAGER_KEY`, `SPARK_REGISTRY_KEY`), 引入 `createVueSparkPlugin`，统一组件工厂 `createSparkComponent`。移除若干遗留 shim 与备份文档。

**Breaking Changes**
- 全局 provider API 已删除。所有 capability 必须通过组件上下文或 Vue 插件注入。详见 PR 描述与 `DEPRECATION.md`。

**Migration notes**
- 在应用入口使用 `app.use(Spark.createVuePlugin({ manager, registry }))`。
- 测试中显式提供 `sparkManager: Spark.manager()`。
- 将自定义 logger 的提供改为 context provider。

**Files of note**
- Removed: `packages/spark-core/src/utils/GlobalProviderRegistry.ts`, `shared/utils/componentHelpers.ts`, 旧 patches 文件等
- Added/changed: `packages/spark-core/src/composables/useSparkComponent.ts`,`packages/spark-core/src/plugins/VueSparkPlugin.ts`,`packages/spark-core/src/utils/diKeys.ts`

**Testing**
- 本地测试：32 个 test files, 63 tests 全部通过。

