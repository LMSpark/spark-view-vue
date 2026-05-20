/**
 * Page-design edit flow prompt fragments.
 *
 * 这些片段属于四文件编辑业务流程，不进入 core 协议层。
 */

import { summarizePageDesignFlowPhases } from '@spark-view/spark-page-config'

const PAGE_DESIGN_FLOW_PHASES = summarizePageDesignFlowPhases()

function formatPageDesignFlowPhases(): string {
  return PAGE_DESIGN_FLOW_PHASES
    .map((phase) => `${phase.phase}(${phase.firstStep}-${phase.lastStep})`)
    .join(' -> ')
}

const EDIT_FLOW_1001_DESIGN_FLOW = `【页面设计 100 步流程】
- 页面设计流程真源来自 spark-page-config/files/design/page-design-100-step-flow。
- 阶段顺序：${formatPageDesignFlowPhases()}。
- 复杂修改开始前先调用 lifecycle.describeDesignFlow({}) 或按 phase / step / afterStep 查询当前位置。
- 不要在 prompt 中重新发明流程；以 lifecycle.describeDesignFlow 返回的 phases / steps / nextStep 为准。`

const EDIT_FLOW_1002_DATA_FIRST_POLICY = `【数据优先（模型级）】
- 数据优先是硬约束：先完成 DataSet 模型，再考虑 UI/脚本。
- 在数据阶段完成前，不得调用 nodeTree 写函数、textModel.writeScript 或 textModel.writeStyle。
- 数据阶段收敛后，直接进入页面结构与脚本阶段。`

const EDIT_FLOW_1003_DATA_FIRST_SEQUENCE = `【最小执行序列】
1) dataset 函数（可多次）
2) nodeTree 函数 / textModel.write*`

export class PageDesignEditFlowPrompts {
	readonly designFlow = EDIT_FLOW_1001_DESIGN_FLOW

	readonly dataFirstPolicy = EDIT_FLOW_1002_DATA_FIRST_POLICY

	readonly dataFirstSequence = EDIT_FLOW_1003_DATA_FIRST_SEQUENCE
}
