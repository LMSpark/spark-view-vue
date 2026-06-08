# VCM Generator 与 callbackApis 迁移

> 状态：设计有效（2026-06）；**callbackApis 尚未落地**。执行计划见 [`.cursor/plans/全面解决方案.md`](../../.cursor/plans/全面解决方案.md)。运行时现状见 [`NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md`](NATIVE-RUNTIME-AND-AGENT-FLOW.zh-CN.md) §8。

## Generator 在链路中的位置

```text
TS 业务类 + @moduleKind JSDoc
  → vite-plugin-spark-catalog / module-metadata-generator.ts
  → *.runtime.generated.json（schemaVersion 2，apiRegistry + $ref）
  → readPageDesignProjectMetadata() / AiModuleAdapter
  → native-script-context Proxy
```

构建命令：`pnpm run generate:module-metadata`（仓库根或 catalog 包脚本）。

---

## createApiActionMetadata 决策树（当前）

`module-metadata-generator.ts` 对每个 public method：

```text
返回 void 或 @vcmNoResultApis
  ├─ @vcmScriptOnly 或 paramsSchema 含 run 回调
  │    └─ discoverMutatorCallbackResultApis
  │         readCallbackFirstArgumentType(run 首参)
  │         → 今日 emit 进 resultApis（语义错位，待迁 callbackApis）
  └─ 否则 discoverResultApis（unwrap AiModuleResult<T>，递归属性 path）

非 void 返回
  └─ discoverResultApis → action.resultApis（openPageDesign → config-page 等）
```

**Runtime audit**（`createRuntimeMethodChildModels`）已在语义层区分：

| source | 示例 | 物理字段（今日） |
|--------|------|------------------|
| `return` | `openPageDesign` → `config-page` | `resultApis` |
| `callback-param` | `editDataSet(run)` → `dataset` | **错放在** `resultApis` |

ClassModel 测试断言 guide 文本**不暴露** `resultApis`/`callbackApis` 字段名（面向 LLM 的 d.ts-like 签名）。

---

## 为何需要 callbackApis（F1）

### 现状问题

1. **`editDataSet` / `editNodeTree` 返回 `Promise<void>`**，但 generator 把 `dataset` / `node-tree` 子模型写在 `resultApis` 里 → 对 void 返回是**死元数据**。
2. **运行时**通过 `run` 回调首参交付真实对象；`native-script-context` 对回调参数 **原样 `Reflect.apply`**，`ds`/`tree` 是裸业务对象，**无 schema 校验、无 Proxy 链**。
3. LLM 知识若读 `resultApis` 会误以为 `editDataSet` 有返回值链，加剧 `page.editDataSet(...)` vs `page.editDataSet(async ds => ...)` 类错误。

### 目标形状（schemaVersion 3）

```typescript
// AiApiActionMetadata（拟议）
actions[].resultApis   // 仅「返回值」子模型边
actions[].callbackApis // 仅「回调参数」子模型边；本轮 R1：callbackApis[0]，resultPath = ['0']
```

示例（迁移后）：

```json
{
  "name": "editDataSet",
  "resultApis": [],
  "callbackApis": [{ "$ref": "dataset", "resultPath": ["0"] }]
}
```

---

## native-runtime 侧改造（§5.1 计划）

`callApiMethod` 遇到带 `run` 的 action 时：

```text
1. 校验 run 为 function，否则 SCHEMA_VALIDATION_FAILED
2. 读取 action.callbackApis[0] → 子 api metadata
3. 包装 run 首参：createResolvedApiSurface(ds, datasetApi, ctx)
4. 再 Reflect.apply 业务 method
```

**R1 范围**：仅「单 run 回调、首参为子模型」；多参 callback 数组预留，本轮只实现 `callbackApis[0]`。

---

## $ref 与体积（F4）

runtime 真源已是 `schemaVersion: 2` + `apiRegistry`（约 7700 行，108 个 resultApis 已 `$ref`）。

schemaVersion 3 **必须**让 callbackApis 走同一 `$ref`/apiRegistry 机制，否则 node-tree/dataset 子树重复内联会导致 JSON 膨胀。

验收：迁移后 runtime 行数仍 ≈ 现量级（设上限阈值测试）。

---

## 与 F8 / vcm_* 工具的关系

| 阶段 | 内容 |
|------|------|
| F5–F6 | generator 改字段名 + schema/validate/resolve 同步 |
| F7 | `PROTOCOL_TOOL_NAMES` → `VCM_TOOL_NAMES`（7 工具闭集） |
| F9 | knowledge projector 吃 callbackApis，删 path/`module_find` 教学 |

目标工具：`vcm_query`、`vcm_model_guide`、`vcm_attribute_guide`、`vcm_action_guide`、`vcm_script`、`human_question`、`agent_complete`。

---

## 迁移检查清单

- [ ] `ai-api-object-metadata-schema.ts` 增加 `callbackApis`
- [ ] `resolve-api-object-metadata.ts` / `validate-api-object-metadata.ts` 支持 $ref 去重
- [ ] `module-metadata-generator.ts`：`discoverMutatorCallbackResultApis` 产物改 emit 到 `callbackApis`
- [ ] 重新 generate pageDesign metadata（不手改 JSON）
- [ ] 断言 `editNodeTree`/`editDataSet` 的 `resultApis` 为空，`callbackApis[0].$ref` 正确
- [ ] `native-script-context.ts` 注入 callback 参数 Proxy
- [ ] recovery enricher 删 path 条目，保留 SCRIPT_EXECUTION_FAILED 脚本 hint
- [ ] 单测：`ai-api-script-context.test.ts`、ClassModel guide 不含内部字段名

---

## 关键文件

| 路径 | 职责 |
|------|------|
| `packages/vite-plugin-spark-catalog/src/module-metadata-generator.ts` | TS → metadata |
| `packages/spark-ai/src/modules/metadata/ai-api-object-metadata-schema.ts` | JSON Schema 形状 |
| `packages/spark-ai/src/modules/metadata/resolve-api-object-metadata.ts` | $ref 解析 |
| `packages/spark-ai/src/agent/native-runtime/native-script-context.ts` | Proxy / 回调注入 |
| `packages/spark-ai/src/vcm-native/tests/class-model.test.ts` | guide 投影断言 |
