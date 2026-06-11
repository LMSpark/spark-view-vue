/**
 * pageDesign SOP 编排：仅决定 toolLoopNudge 何时触发与 pageId 上下文。
 *
 * 业务契约 SSOT：spark-project-model JSDoc → DTS ClassModel → model_*_guide / recovery hints。
 */
import type { AiAgentToolLoopNudgeReason } from '@spark-appworks/spark-ai/agent'

export function buildPageDesignToolLoopNudge(
  reason: AiAgentToolLoopNudgeReason,
  pageId: string,
): string | undefined {
  switch (reason) {
    case 'plan_without_tool':
      return `pageId="${pageId}"；禁止只输出计划，下一回合必须发起 tool_call（见 model_action_guide / RECOVERY_HINT）。`
    case 'execution_phase':
      return `pageId="${pageId}"；目录/指南阶段已完成，直接 model_script。`
    case 'model_script_retry':
      return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试 model_script。`
    default:
      return undefined
  }
}

