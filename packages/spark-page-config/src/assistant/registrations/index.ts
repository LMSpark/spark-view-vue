/**
 * Assistant 注册模块 barrel 入口。
 *
 * 汇总导出两大业务模块（PageDesign / LeaveRequest）和统一注册入口 registerAssistantBusinesses()。
 * 消费方通过此文件获取所有 AI Assistant 相关的模块、服务和类型。
 */

export {
  PageDesignModule,
  DatasetModule,
  LifecycleModule,
  NodeTreeModule,
  TextModelModule,
  PageDesignEditActionClassifier,
  PageDesignEditFlowPrompts,
  PageDesignEditRuntimePrompt,
  type DatasetCrudToolFunctionFailureMode,
  type EditLifecycleFunctionFailureMode,
  type EditLifecycleFunctionId,
  type PageDesignModuleOptions,
  type SparkNodeTreeToolFailureMode,
  type SparkNodeTreeToolFunctionId,
  type TextModelFunctionFailureMode,
  type TextModelFunctionFileKey,
  type TextModelFunctionId,
} from './page-design'

export {
  LeaveRequestModule,
  LeaveRequestModuleRegistration,
  LeaveRequestService,
  type LeaveRequestDraftFields,
  type LeaveRequestDraftState,
  type LeaveRequestDraftStatus,
  type LeaveRequestServiceContext,
  type LeaveRequestServiceResult,
} from './leave-request'

export {
  registerAssistantBusinesses,
} from './assistant-businesses'

export type {
  RegisterAssistantBusinessesOptions,
} from './assistant-businesses'
