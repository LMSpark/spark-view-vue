/**
 * Assistant 注册模块 barrel 入口。
 *
 * 汇总导出两大 module-semantic 业务注册（PageDesign / LeaveRequest）和统一注册入口。
 * 消费方通过此文件获取所有 AI Assistant 相关的模块、服务和类型。
 */

export {
  PAGE_DESIGN_MODULE_ID,
  DATASET_ACTIONS,
  LIFECYCLE_ACTIONS,
  NODE_TREE_ACTIONS,
  PAYLOAD_CATALOG_ACTIONS,
  TEXT_MODEL_ACTIONS,
  createPageDesignBusinessRegistration,
  PageDesignEditActionClassifier,
  PageDesignEditFlowPrompts,
  PageDesignEditRuntimePrompt,
  type DatasetCrudToolFunctionFailureMode,
  type EditLifecycleFunctionFailureMode,
  type EditLifecycleFunctionId,
  type PageDesignModuleKindId,
  type PageDesignModuleOptions,
  type PageDesignRuntimeContext,
  type PayloadCatalogFunctionFailureMode,
  type PayloadCatalogFunctionId,
  type SparkNodeTreeToolFailureMode,
  type SparkNodeTreeToolFunctionId,
  type TextModelFunctionFailureMode,
  type TextModelFunctionFileKey,
  type TextModelFunctionId,
  NodeTreeModuleKind,
  NodeTreeCapability,
  type NodeTreeCapabilityOptions,
} from './page-design'

export {
  LEAVE_REQUEST_ACTIONS,
  LEAVE_REQUEST_KIND,
  LEAVE_REQUEST_MODULE_ID,
  createLeaveRequestBusinessRegistration,
  createLeaveRequestDraftId,
  LeaveRequestService,
  type LeaveRequestBusinessRegistrationOptions,
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
