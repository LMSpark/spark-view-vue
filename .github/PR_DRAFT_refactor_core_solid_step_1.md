# PR 草稿: DI-first 重构与移除全局 Provider（refactor/core-solid-step-1-singletons）

## 概要
此 PR 对 `packages/spark-core` 与若干组件做了大规模重构，目标为：

- 采用 **DI-first（Symbol DI）**，移除全局注册/全局 Provider（GlobalProviderRegistry）以便 SSR 与可测性。
- 统一组件工厂：`createSparkComponent` / `SparkComponentBase`。
- 引入 `createVueSparkPlugin`（插件化安装表面），使用 `SPARK_MANAGER_KEY` / `SPARK_REGISTRY_KEY` 等 Symbol 进行注入。
- 删除遗留文件与备份（多处 `patches` / 旧文档）并移除与全局注册相关的 shim。
- 将 `Logger` 改为仅通过 context 提供（不再依赖全局单例）。


## Breaking changes（重要）
- 移除了 `GlobalProviderRegistry` 与全局 provider API，所有能力现在必须通过组件 context 提供或通过 `Spark.createVuePlugin({ manager, registry })` 安装插件。
- 旧的字符串 DI fallback（例如直接注入 `sparkManager` 字符串）仍存在短期兼容代码，但会在后续移除。建议尽快迁移到 Symbol 注入。


## 迁移步骤（建议）
1. 在 app 入口用插件安装 manager：

```ts
app.use(Spark.createVuePlugin({ manager, registry }));
```

2. 将组件内依赖改为 `useSparkComponent()`（或 `consumeCapability`）并通过 `whenProviderAvailable` 等方式做安全延迟绑定。
3. 不再依赖 `getGlobalProvider` / `GlobalProviderRegistry`，在测试中为依赖注入 `sparkManager: Spark.manager()`。
4. 更新任何自定义 logger 的使用，改为从 context 的 logger provider 获取实现。


## 变更清单（摘要）
- 添加/修改: `diKeys.ts`, `VueSparkPlugin.ts`, `useSparkComponent.ts`, Logger（context-only）等。
- 删除: `GlobalProviderRegistry.ts`, `componentHelpers.ts`, `componentRegistry` 的 shim，以及若干备份补丁文件。
- 测试: 修改并新增若干测试，包括 `forbiddenImports`/`forbiddenSingletons` 等以防止将来回退。


## 测试 & 验证
- 本地测试已通过：32 个测试文件，63 个测试全部通过（详见 CI 输出）。


## PR Checklist
- [ ] 所有本地测试通过
- [ ] 已更新 CHANGELOG / DEPRECATION 文档
- [ ] PR 描述中包含破坏性变更与迁移指南
- [ ] 请指派至少一位核心维护者审查（推荐 @owner1, @owner2）


---
请确认 PR 描述是否需要补充，确认后我可以协助在 Gitee 上打开 Pull Request（需要你授权或在 Gitee web UI 上点击创建）。