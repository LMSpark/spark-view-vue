/**
 * 1001 — Data-First Policy
 *
 * 编辑模式的流程硬约束：必须先完成数据阶段，再进入 UI/脚本阶段。
 */
export const EDIT_FLOW_1001_DATA_FIRST_POLICY = `【数据优先（模型级）】
- 数据优先是硬约束：先完成 DataSet 模型，再考虑 UI/脚本。
- 在数据阶段完成前，不得调用 sparkNodeTree.* / textModel.writeScript / textModel.writeStyle。
- 数据阶段收敛后，直接进入页面结构与脚本阶段。`

/**
 * 1002 — Data-First Minimal Sequence
 *
 * 编辑模式最小执行链路，供模型按固定顺序推进。
 */
export const EDIT_FLOW_1002_DATA_FIRST_SEQUENCE = `【最小执行序列】
1) datasetTool.*（可多次）
2) sparkNodeTree.* / textModel.write*`