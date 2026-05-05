/**
 * Page-design edit flow prompt fragments.
 *
 * 这些片段属于四文件编辑业务流程，不进入 core 协议层。
 */

export const EDIT_FLOW_1001_DATA_FIRST_POLICY = `【数据优先（模型级）】
- 数据优先是硬约束：先完成 DataSet 模型，再考虑 UI/脚本。
- 在数据阶段完成前，不得调用 pageDesign@nodeTree@* / pageDesign@textModel@writeScript / pageDesign@textModel@writeStyle。
- 数据阶段收敛后，直接进入页面结构与脚本阶段。`

export const EDIT_FLOW_1002_DATA_FIRST_SEQUENCE = `【最小执行序列】
1) pageDesign@dataset@*（可多次）
2) pageDesign@nodeTree@* / pageDesign@textModel@write*`
