// AI Core Layer — business-first instance/runtime/function execution API.
//
// 新核心公开面只暴露业务定义注册、实例生命周期、模块运行态读取、
// 通用历史、事件订阅与单次函数执行。模型通讯、tool schema 投影、
// 多轮编排、旧全局函数 registry / carrier registry 都不属于 core 出口。

export type {
  AiCore,
  AiCoreAction,
  AiCoreAppendMessage,
  AiCoreAppendMessagesOptions,
  AiCoreEvent,
  AiCoreEventListener,
  AiCoreEventType,
  AiCoreExecuteFunctionCallOptions,
  AiCoreExecuteFunctionCallResult,
  AiCoreFunctionCallRecord,
  AiCoreFunctionCallResult,
  AiCoreFunctionExposure,
  AiCoreFunctionExposureSnapshot,
  AiCoreHistoryMessage,
  AiCoreHistorySnapshot,
  AiCoreInstanceDetail,
  AiCoreInstanceSnapshot,
  AiCoreInstanceStatus,
  AiCoreLifecycleMarker,
  AiCoreMessageRole,
  AiCoreBusinessId,
  AiCoreFunctionId,
  AiCoreModuleRuntimeSnapshot,
  AiCoreModuleId,
  AiCoreOptions,
  AiCoreStartSessionOptions,
  AiCoreStartSessionResult,
  AiCoreStopMode,
  AiCoreStopSessionOptions,
  AiCoreStopSessionResult,
  FunctionFailureMode,
  FunctionExecutionContext,
  IBusinessDefinition,
  IFunctionCatalogProvider,
  IFunctionDefinition,
  IModule,
  IModuleInstanceAccessor,
  IModulePromptProvider,
  ModuleAfterExecuteContext,
  ModuleBeforeExecuteContext,
  ModuleBeforeExecuteDecision,
  ModulePromptContext,
  ModuleRuntime,
  ModuleRuntimeLifecycleContext,
  ModuleRuntimeReader,
  PostValidationWarning,
} from './protocol/business-contracts'

export {
  createAiCore,
} from './runtime/ai-core'
