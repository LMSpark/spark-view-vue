# pageDesign 生成轨观测摘要

> 机器快照：[`page-design-e2e-observation.snapshot.json`](./page-design-e2e-observation.snapshot.json)
> 命令：`pnpm run report:page-design:e2e`（可用 `AI_E2E_ROUNDS` 覆盖轮数）

## 立场

- **结构轨**（fixture + offline Vitest）为 CI 门禁，本观测**不驱动** SOP/架构改动。
- 失败模式仅作 LLM 协议稳定性输入，新增 recovery 须经 catalog 表驱动评审。

## 本次运行（2026-06-10T00:50:52.757Z）

- HEAD: `9b70b5562d05cb84c29734e90e1ea7888a7b13b3`
- 轮数: 2/2
- 成功: 0，失败: 2
- 首次成功轮: 无

## 分轮摘要

### Round 1

- ok: false
- tools: 4，failedTools: 2
- pageId: ai-leave-request-form-observe-mq7cri6v-1
- verifyArtifacts: false
- durationMs: 14849
- failedTools:
  - `vcm_query` / INVALID_VCM_NATIVE_TOOL_ARGS: 工具 "vcm_query" 不接受参数: member。允许参数: kind, keyword, includeMembers。
  - `vcm_attribute_guide` / INVALID_VCM_NATIVE_TOOL_ARGS: 工具 "vcm_attribute_guide" 不接受参数: className。允许参数: kind, attributeName。
- reasons:
  - sendDemand.error: ClassModel method not found: data-table.createTable
  - rule.json / pagedata.json not changed and saved
  - artifact: semantic check failed: hasLeaveRequestTable
  - artifact: semantic check failed: hasLeaveTypeOptions
  - artifact: semantic check failed: hasPendingOrListView
  - vcm_query: INVALID_VCM_NATIVE_TOOL_ARGS 工具 "vcm_query" 不接受参数: member。允许参数: kind, keyword, includeMembers。

### Round 2

- ok: false
- tools: 3，failedTools: 2
- pageId: ai-leave-request-form-observe-mq7cruh4-2
- verifyArtifacts: false
- durationMs: 9523
- failedTools:
  - `vcm_query` / INVALID_VCM_NATIVE_TOOL_ARGS: 工具 "vcm_query" 不接受参数: member。允许参数: kind, keyword, includeMembers。
  - `vcm_attribute_guide` / INVALID_VCM_NATIVE_TOOL_ARGS: 参数 "attributeName" 缺失或非字符串。
- reasons:
  - sendDemand.error: ClassModel method not found: data-table.createTable
  - rule.json / pagedata.json not changed and saved
  - artifact: semantic check failed: hasLeaveRequestTable
  - artifact: semantic check failed: hasLeaveTypeOptions
  - artifact: semantic check failed: hasPendingOrListView
  - vcm_query: INVALID_VCM_NATIVE_TOOL_ARGS 工具 "vcm_query" 不接受参数: member。允许参数: kind, keyword, includeMembers。

