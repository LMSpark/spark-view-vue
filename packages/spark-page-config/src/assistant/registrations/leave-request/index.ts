/**
 * 人工请假模块 barrel 入口。
 *
 * 导出 LeaveRequestModule（AI 运行时注册模块）和 LeaveRequestService（草稿状态管理），
 * 以及相关的类型定义。供 assistant-businesses.ts 和外部消费方使用。
 */

export {
  LeaveRequestModule,
  LeaveRequestModuleRegistration,
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