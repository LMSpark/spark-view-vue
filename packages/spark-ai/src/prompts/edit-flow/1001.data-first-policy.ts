/**
 * 1001 — Data-First Policy
 *
 * 编辑模式的流程硬约束：必须先完成数据阶段，再进入 UI/脚本阶段。
 */
export const EDIT_FLOW_1001_DATA_FIRST_POLICY = `【数据优先（模型级）】
- 数据优先是硬约束：先完成 DataSet 模型，再考虑 UI/脚本。
- 第一轮必须先调用 dataset.modelSummary，理解当前模型基线。
- 任何 datasetTool.* 写动作后，必须调用 dataset.modelDelta 验证模型级变化。
- 在数据阶段完成前，不得调用 sparkNodeTree.* / file.writeScript / file.writeStyle。
- 数据阶段收敛后，必须先调用 dataset.export，再进入页面结构与脚本阶段。`
