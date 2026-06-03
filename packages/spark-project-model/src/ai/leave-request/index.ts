/**
 * 人工请假模块——独立的 AI 业务示例。
 *
 * ## 概述
 * 本模块向 spark-ai Host 注册一个完整的人工请假 AI 业务：
 * 草稿状态机 + LLM 工具暴露 + 人员目录查询。
 * 与 PageDesign 完全独立，不共享任何类型、服务或 AiModule。
 *
 * ## 公共 API
 * - `createLeaveRequestBusinessRegistration(options)` → AiAgentRegistration
 * - `createLeaveRequestDraftId(now?)` → 生成草稿 ID
 */

export {
  LEAVE_REQUEST_KIND,
  LEAVE_REQUEST_MODULE_ID,
  createLeaveRequestBusinessRegistration,
  createLeaveRequestDraftId,
} from './leave-request'

export type {
  LeaveRequestBusinessRegistrationOptions,
} from './leave-request'
