# 业务 Nudge 下沉 — 迭代对账

> 对账锚点：[`.cursor/plans/业务_nudge_下沉_7a9eee96.plan.md`](../../.cursor/plans/业务_nudge_下沉_7a9eee96.plan.md)（阶段 3）  
> 机器快照：[`business-nudge-sink-reconciliation.snapshot.json`](./business-nudge-sink-reconciliation.snapshot.json)（由 `pnpm run verify:business-nudge-reconciliation` 生成）

## 无回归声明

在 **阶段 3 完成定义** 范围内，当前仓库 **无回归**：

| 完成定义项 | 状态 | 证据 |
|-----------|------|------|
| `tool-loop-runner` / `function-call-recovery-enricher` 无 `openPageDesign` 等业务字面量 | ✅ | `packages/spark-ai/src/agent/tool-loop` grep 0；`verify:arch` `checkSparkAiBusinessMaterial` |
| pageDesign **正向** SOP 仅在 `src/services/page-design-business.ts` | ✅ | hooks + `pageDesignScriptSopLines`；`project-planning-business` 仅为**禁止** openPageDesign |
| 新增测试 + `verify:arch` 通过 | ✅ | 见下方验证命令 |

复跑对账：

```bash
pnpm run verify:business-nudge-reconciliation
```

## 计划条目逐项对账

### §1 扩展注册契约

| 计划 | 实现 | 判定 |
|------|------|------|
| `toolLoopNudge` / `executionToolNames` / `planWithoutToolMarkers` / `enrichRecoveryHints` | `registration-types.ts`、`vcm-native-agent-adapter.ts`、`business-task.ts` | ✅ |
| reason 含 `module_script_retry` | 实现为 `vcm_script_retry` | ⚠️ 正偏差（VCM 协议命名） |

### §2 瘦身 tool-loop-runner

| 计划 | 实现 | 判定 |
|------|------|------|
| 保留协议级 nudge | `TOOL_PRODUCTION_LINE_PROMPT`、`PSEUDO_TOOL_CALL_NUDGE`、catalog 工具名 | ✅ |
| 业务文案改读 `registration.toolLoopNudge` | `resolveToolLoopNudge` | ✅ |
| 无 hook 时不注入业务 SOP | mock 测试 `tool-loop-nudge-hooks.test.ts` | ✅ |

### §3 pageDesign 业务注入

| 计划 | 实现 | 判定 |
|------|------|------|
| 四类 hook 注册 | `page-design-business.ts` `VcmNativeAgentAdapter.createRegistration` | ✅ |
| SOP 从同一 helper 派生 | `page-design-sop.ts` → `systemPrompt` + `toolLoopNudge` + recovery | ✅（阶段 4） |
| recovery 承接原 enricher 分支 | `resolvePageDesignRecoveryHints` + `PAGE_DESIGN_RECOVERY_RULES` | ✅ |

**DEBT-SOP-THREE-CHANNEL（已关闭）**：SOP 收敛至 [`src/services/page-design/page-design-sop.ts`](../../src/services/page-design/page-design-sop.ts)；`page-design-business.ts` 无内联 recovery 分支。守正策略维持：**冻结** iterate 失败驱动的新增 hint / E2E 放宽。

### §4 Recovery enricher 去业务化

| 计划 | 实现 | 判定 |
|------|------|------|
| 通用路径无 `openPageDesign` | `function-call-recovery-enricher.ts` + 测试 | ✅ |
| executor 传入 `enrichRecoveryHints` | `tool-call-executor.ts` | ✅ |

### §5 测试与门禁

| 计划 | 实现 | 判定 |
|------|------|------|
| `tool-loop-nudge-hooks.test.ts` | 已建 | ✅ |
| recovery 测试更新 | `function-call-recovery-enricher.test.ts` | ✅ |
| `verify-arch` 扩展禁词 | `openPageDesign` / `editDataSet` / `editNodeTree` | ✅ |

## 计划外分叉（偏差矩阵）

| 工作 | 相对计划 | 正/负 | 暂时/长远 |
|------|----------|-------|-----------|
| `native-runtime` 去业务化 | 计划写「本轮不碰」 | 正 | 长远 |
| `verify:ai-codegen` 全绿、`verify:rules` 全绿 | 计划写「不跑全量」 | 正 | 长远 |
| ClassModel `returnTypeText`、801 覆盖 | 另一计划线 | 正 | 长远 |
| `verify-page-design-e2e` / `iterate-page-design-e2e` / fixture | 计划未列 | 正 | 长远（结构轨锚点） |
| E2E 验收字段放宽（`prop`/`duration` 等） | 计划未列 | 正负兼有 | 暂时 |
| iterate 失败 → 不断加 recovery 分支 | 违反 SOP 收敛 | 负风险 | 暂→长（已叫停） |

## 双轨验收（守正）

| 轨道 | 用途 | CI 门禁 |
|------|------|---------|
| **结构轨** | fixture + offline Vitest + `--validate-dir` | 必绿：`verify:page-design`、`verify:page-design:artifacts` |
| **生成轨** | LLM E2E / iterate 抽样 | 不驱动架构改动；flake 记观测，不反向改 SOP |

结构轨锚点：`tests/fixtures/page-design-leave-request-smoke/`（真机成功页固化）。

## 验证命令快照（对账时全绿）

```bash
pnpm run verify:business-nudge-reconciliation  # 本对账脚本 + 写 snapshot
pnpm run verify:arch
pnpm run verify:rules
pnpm run verify:page-design                    # 39 tests
pnpm run verify:page-design:artifacts
pnpm exec vitest run packages/spark-ai/src/tests/tool-loop-nudge-hooks.test.ts \
  packages/spark-ai/src/tests/function-call-recovery-enricher.test.ts \
  packages/spark-ai/src/tests/legacy-protocol-tool-names.test.ts \
  tests/page/verify-rules.test.ts
```

## 架构结果（不忘初心）

```text
spark-ai 内核（tool-loop / recovery / native-runtime）→ 协议级
app 层（page-design-business）→ toolLoopNudge / enrichRecoveryHints
业务注册唯一路径：VcmNativeAgentAdapter.createRegistration
```

## 阶段 4（已完成）

- SOP SSOT：[`page-design-sop.ts`](../../src/services/page-design/page-design-sop.ts)
- 测试：[`tests/page/page-design-sop.test.ts`](../../tests/page/page-design-sop.test.ts)

## 生成轨观测

- 脚本：`pnpm run report:page-design:e2e`（默认 3 轮，可用 `AI_E2E_ROUNDS` 覆盖）
- 摘要：[`page-design-e2e-observation.md`](./page-design-e2e-observation.md)
- 快照：[`page-design-e2e-observation.snapshot.json`](./page-design-e2e-observation.snapshot.json)
- 退出码以落盘为准；E2E 成败仅记入 snapshot，**不驱动** SOP/架构改动

## recovery pageId 插值

- `EnrichFunctionCallFailureCommand.moduleInstanceId` 由 `tool-call-executor` 注入
- `openPageFirst` recovery hint 在 pageId 可用时插值具体 `pageId`

## 协议 recovery 分层

| 层 | SSOT | recovery 来源 |
|----|------|----------------|
| VCM 协议工具（`vcm_query` / `vcm_*_guide` / `vcm_script`） | [`vcm-native-tool-specs.ts`](../../packages/spark-ai/src/vcm-native/tools/vcm-native-tool-specs.ts) | 内核 `buildVcmNativeToolSchemaRecoveryHint` 从工具 schema 派生 |
| pageDesign 业务脚本链 | ClassModel / `project-model` JSDoc（`@usageRule` / `@failureMode`） | `page-design-sop.ts` 仅承接**业务**失败模式，不硬编码协议参数字段 |
