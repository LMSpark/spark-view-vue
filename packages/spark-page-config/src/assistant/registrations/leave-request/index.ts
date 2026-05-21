/**
 * 人工请假模块 barrel 入口。
 *
 * 导出 LeaveRequest module-semantic 业务注册和 LeaveRequestService（草稿状态管理），
 * 以及相关的类型定义。供 assistant-businesses.ts 和外部消费方使用。
 */

export {
  LEAVE_REQUEST_ACTIONS,
  LEAVE_REQUEST_KIND,
  LEAVE_REQUEST_MODULE_ID,
  createLeaveRequestBusinessRegistration,
  createLeaveRequestDraftId,
} from './leave-request-module'

export type {
  LeaveRequestBusinessRegistrationOptions,
} from './leave-request-module'

export {
  LeaveRequestService,
} from './leave-request-service'

export type {
  LeaveRequestDraftFields,
  LeaveRequestDraftState,
  LeaveRequestDraftStatus,
  LeaveRequestServiceContext,
  LeaveRequestServiceResult,
} from './leave-request-service'
