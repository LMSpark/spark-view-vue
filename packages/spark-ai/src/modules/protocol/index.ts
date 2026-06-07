/**
 * modules · 协议层公共入口（门面）
 *
 * 协议层级：入口层（依赖所有协议文件）
 * 核心职责：本目录的稳定门面，按协议栈从底层到上层排列导出。
 *   所有外部消费者（Navigator、Runtime、Host、测试）均通过此文件导入协议类型。
 * 上游依赖：本目录所有 6 个协议文件
 * 下游消费：modules 内部（Navigator、Runtime）、agent 层、测试
 *
 * 文件与依赖关系（从底层到上层，按协议栈排列）：
 *   1. module-operation — 操作结果与诊断条目（无协议内依赖，最底层）
 *   2. module-path      — 路径值对象与解析错误（无协议内依赖）
 *   3. module-context   — Host 上下文、实例引用与运行委托（依赖 1+2）
 *   4. module-metadata  — AiModule 声明式元数据与构造选项（依赖 3）
 *   5. module-request   — Runtime/API 边界请求 DTO（依赖 2+3）
 *   6. ai-module        — 协议核心 class（依赖 1-5）
 *
 * 约束：
 *   公共 barrel 禁止 export *，新增协议符号必须在此显式登记。
 *   导出顺序遵循依赖关系：底层先导出，上层后导出。
 */

// ── 第 1 层：操作结果与路径（无协议内依赖）──

export {
  AiModulePath,
  AiModulePathParseError,
  AiModulePathSegment,
  appendAiModulePath,
  buildAiModulePath,
  parseAiModulePath,
} from './module-path'

export type {
  AiModulePathParseErrorCode,
  AiModulePathSegmentInput,
} from './module-path'

export {
  AiModuleCheck,
  AiModuleResult,
} from './module-operation'

export type {
  AiModuleCheckLevel,
  AiModuleResultOptions,
} from './module-operation'

// ── 第 2 层：运行时上下文与委托（依赖 module-operation + module-path）──

export type {
  AiModuleChildrenLister,
  AiModuleHostContext,
  AiModuleInstanceFinder,
  AiModuleInstanceQuery,
  AiModuleInstanceRef,
  AiModuleOperation,
  AiModuleRunner,
  AiModuleScriptContextProvider,
  AiModulePathContext,
} from './module-context'

// ── 第 3 层：元数据声明（依赖 module-context）──

export type {
  AiModuleFunctionAntiExample,
  AiModuleFunctionExample,
  AiModuleFunctionFailureMode,
  AiModuleFunctionMetadata,
  AiModuleFunctionResultApiMetadata,
  AiModuleFunctionResultSchema,
  AiModuleAttributeAccessor,
  AiModuleAttributeAccess,
  AiModuleAttributeMetadata,
  AiModuleConstructorMetadata,
  AiModuleNestedApiMetadata,
  AiModuleOptions,
} from './module-metadata'

// ── 第 4 层：API 请求 DTO（依赖 module-context + module-path）──

export type {
  AiModuleFindInstanceRequest,
  AiModuleFunctionInvokeRequest,
  AiModuleSetAttributeRequest,
} from './module-request'

// ── 第 5 层：协议核心 class（依赖以上所有层）──

export {
  AiModule,
} from './ai-module'
