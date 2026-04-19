/**
 * 1002 — Data-First Minimal Sequence
 *
 * 编辑模式最小执行链路，供模型按固定顺序推进。
 */
export const EDIT_FLOW_1002_DATA_FIRST_SEQUENCE = `【最小执行序列】
1) dataset.modelSummary
2) datasetTool.*（可多次）
3) dataset.modelDelta
4) dataset.changedLines
5) dataset.export`
