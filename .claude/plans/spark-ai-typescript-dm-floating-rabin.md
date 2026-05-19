# 函数级接口标准化：Protocol 层统一定义，注册直接使用

## Context

当前 `PageDesignFunctionCatalogRow`（11 字段）与 `AiFunctionRegistration`（8 字段）结构不一致，`createModule()` 中存在手动字段挑选转换。Catalog 行携带的 `type`、`target`、`runtimeBinding`、`runtimeRegistration` 是 page-design 内部的路由元数据，core 层零消费。10 轮问答确认：

- `runtimeBinding`：彻底删除，路由逻辑收归业务服务层内部控制
- `type` / `target`：一并删除，不需要数据携带
- `runtimeRegistration`：一并删除，零消费
- `example`：加入 Protocol 层作为可选字段 `example?: LlmJsonObject`
- `resultSchema`：Protocol 层保持可选，Catalog 行用 try 设计默认值兼容
- `PageDesignFunctionCatalogRow`：完全删除，Catalog 行用 `satisfies AiFunctionRegistration[]` 约束
- 验证参数统一走 JSON Schema，函数内部按需二次验证

## 影响范围

### 修改文件清单

| 序号 | 操作 | 文件 |
|------|------|------|
| 1 | **修改**（新增 `example?` 字段） | `packages/spark-ai/src/core/protocol/runtime-contracts.ts` |
| 2 | **修改**（删除 `type`、`target`、`runtimeBinding`、`runtimeRegistration`，只保留 `PageDesignToolCatalog` 基类） | `packages/spark-ai/src/registrations/page-design/modules/tool-catalog.ts` |
| 3 | **修改**（删除 `type`/`target`/`runtimeBinding`/`runtimeRegistration`/`fileKey`/`crudToolMethod`，重写 `apply` 闭包） | `packages/spark-ai/src/registrations/page-design/modules/lifecycle-tool-catalog.ts` |
| 4 | **修改**（同上） | `packages/spark-ai/src/registrations/page-design/modules/text-model-tool-catalog.ts` |
| 5 | **修改**（同上） | `packages/spark-ai/src/registrations/page-design/modules/knowledge-tool-catalog.ts` |
| 6 | **修改**（同上） | `packages/spark-ai/src/registrations/page-design/modules/node-tree-tool-catalog.ts` |
| 7 | **修改**（同上） | `packages/spark-ai/src/registrations/page-design/modules/dataset-tool-catalog.ts` |
| 8 | **修改**（重写 `createFunctionHandlers` 和 `createModule`，适配新结构） | `packages/spark-ai/src/registrations/page-design/page-design-module.ts` |

### 不修改

- `AiFunctionRegistrationData` — 对应持久化存储，`example` 也需要加可选字段保持一致
- `AiRuntimeFunctionExposure` — LLM 投影结果，`example` 可选加入提升 LLM 调用准确率
- 测试文件 — 不改动 capabilityTable（已删除），Catalog 行结构变化后按需调整

## 技术方案

### 步骤 1：Protocol 层扩展 `AiFunctionRegistration`

在 `runtime-contracts.ts` 的 `AiFunctionRegistration` 接口新增：

```typescript
export interface AiFunctionRegistration {
  // ... 已有 8 个字段不变 ...
  readonly example?: LlmJsonObject | undefined
}
```

同步在 `AiFunctionRegistrationData` 中新增：

```typescript
export interface AiFunctionRegistrationData {
  // ... 已有字段不变 ...
  readonly example?: LlmJsonObject | undefined
}
```

`AiRuntimeFunctionExposure` 中也加入可选 `example` 字段，便于投影给 LLM。

### 步骤 2：清理 `tool-catalog.ts`

删除以下类型：
- `PageDesignFunctionKind`
- `PageDesignFunctionRegistrationStatus`
- `PageDesignFunctionRuntimeBinding`（含 `PageDesignServiceRuntimeBinding`、`PageDesignKnowledgeRuntimeBinding`）
- `PageDesignFunctionCatalogRow`

保留 `PageDesignToolCatalog<TRow>` 基类不变（提供 `getParameterRow` 和 `validateParams` 能力）。

### 步骤 3：重写 5 个 Catalog 文件

每个文件的改造模式相同：

**删除**：`type`、`target`、`runtimeBinding`、`runtimeRegistration`、以及各文件特有的 `fileKey`、`crudToolMethod`、`coreMethod` 字段。

**类型约束**：改 `as const satisfies readonly AiFunctionRegistration[]`。

**业务内部路由**：每个文件定义自己的 `apply` 工厂函数，闭包捕获 service/knowledge/runtime，直接调用 service 方法。例如 lifecycle：

```typescript
function createLifecycleHandlers(
  service: PageDesignService,
  knowledge: AiKnowledgeProjection,
  payloadRef: string,
  runtime: PageDesignFunctionBindingRuntime,
): ReadonlyArray<PageDesignFunctionHandler<typeof LIFECYCLE_MODULE_ID>> {
  return LIFECYCLE_CATALOG_ROWS.map((row) => ({
    functionId: row.functionId as string,
    validate: (args) => validateLifecycleParams(row.functionId, args),
    apply: (args, context) => {
      switch (row.functionId) {
        case 'bootstrap': return service.bootstrap(toServiceContext(context))
        case 'describeProgress': return service.describeProgress(toServiceContext(context))
      }
    },
  }))
}
```

knowledge catalog 同理，用 switch 分发到 `knowledge.queryFunctions()` 等方法。

**注意**：node-tree 和 dataset 有大量行（~20 和 ~50），每个行的 switch 分支可以直接映射 service 方法调用。具体实现时可按 functionId 做 map 查找而非 switch 逐行写。

### 步骤 4：修改 `page-design-module.ts`

1. **删除** `PageDesignFunctionDefinition` 类型中的 `moduleId` 字段（已由外层 closure 捕获）
2. **删除** `applyRuntimeBinding` 函数及其依赖的 `PAGE_DESIGN_SERVICE_BINDING_APPLIERS`、`PAGE_DESIGN_KNOWLEDGE_BINDING_APPLIERS`、`toServiceMethodBinding` 等分发逻辑
3. **改写** `createFunctionHandlers` — 接收各模块的 handler 工厂（每个模块一个），不再需要 runtime 参数
4. **改写** `createModule` — 直接接收 `handlers` 数组，匿名子类绑定即可
5. **constructor** 中为每个模块调用各自的 `createXxxHandlers(service, runtime)` 生成 handlers

### 步骤 5：导出链调整

- `page-design/index.ts`：删除 `PageDesignFunctionRuntimeBinding` 等类型的导出
- `registrations/index.ts` 和 `src/index.ts`：同步删除

## 兼容性

- **不破坏任何对外导出类型**：`AiFunctionRegistration` 新增 `example?` 可选字段，向下兼容
- **Catalog 行的消费方只有 `page-design-module.ts`**：改为 `satisfies AiFunctionRegistration[]` 后只需改 import
- **测试文件**：不涉及 `runtimeBinding`/`type`/`target` 的测试断言，无需调整

## 验证计划

1. `pnpm typecheck -p packages/spark-ai/tsconfig.json` — TypeScript 类型检查零错误
2. `pnpm build -F @spark-view/spark-ai` — spark-ai 包构建成功
3. `pnpm test:run -F @spark-view/spark-ai` — 现有测试通过
4. `pnpm dev` — 启动 dev server，手动触发页面设计 AI 功能，验证工具循环正常

## 风险项

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| node-tree / dataset 大量行的 `apply` 映射写错 | 低 | 按 functionId → service method 的 map 查找，减少手写分支 |
| `example` 字段加入后 LLM 投影变大 | 低 | `example` 为可选，当前 catalog 中多数为 `{}` 空对象，实际增量有限 |
| `PageDesignService` 方法签名变化导致闭包不匹配 | 低 | 闭包内直接调用 service 方法，TypeScript 编译期可发现 |
