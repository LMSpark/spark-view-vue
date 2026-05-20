/**
 * @packageDocumentation
 *
 * 跨框架 AI Host 协议与运行时。
 *
 * 提供框架无关的显式业务会话、工具调用循环和传输层契约，
 * 不依赖 Vue/React/Angular 等前端框架。
 *
 * 导出分组（按消费者用途）：
 * ┌─────────────────────────────────────────────────────┐
 * │ 1. 类型定义          所有 interface 和 type           │
 * │ 2. 作用域工具        scope 创建/归一化/转换           │
 * │ 3. Turn 工具         用户输入提取/turn 归一化         │
 * │ 4. 业务注册表        AiHostBusinessRegistry           │
 * │ 5. 工具调用循环      AiHostToolLoopRunner             │
 * │ 6. 诊断工具          事件上报/payload 序列化          │
 * │ 7. 消息发送          AiHostMessageSender / Session    │
 * │ 8. Fetch 传输        AiHostFetchTransport / 附件上传  │
 * └─────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════
// 类型定义（全部 host 层类型契约）
// ═══════════════════════════════════════════════════════

export type {
  // 聊天请求 & SSE 事件
  AiHostChatRequest,
  AiHostSseEvent,
  AiHostFcCallRecord,
  // 业务作用域 & 目标
  AiHostBusinessScope,
  AiHostBusinessTarget,
  // 运行时上下文 & 方法选项
  AiHostBusinessRuntimeContext,
  AiHostBusinessAppendMessageOptions,
  AiHostBusinessExecuteFunctionCallOptions,
  // 生命周期
  AiHostBusinessLifecycleStatus,
  AiHostBusinessLifecycleDirective,
  AiHostBusinessAfterFunctionCallOptions,
  // 运行时契约
  AiHostBusinessRuntime,
  // Turn 元信息
  AiHostTurnMeta,
  // 传输层规范
  AiHostTransportToolSpec,
  AiHostTransportMessage,
  AiHostTransportToolCall,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostAppendMessagesInput,
  // 传输层契约
  AiHostTransport,
  // 宿主选项
  AiHostOptions,
  // 发送器 & 会话
  AiHostSender,
  AiHostBusinessSession,
  // 已选业务
  AiHostSelectedBusiness,
} from './types'

// ═══════════════════════════════════════════════════════
// 作用域工具（scope 创建/归一化/转换）
// ═══════════════════════════════════════════════════════

export {
  createAiHostBusinessScope,
  createAiHostBusinessSessionId,
  createAiHostBusinessStorageKey,
  createAiHostStreamKey,
  normalizeAiHostBusinessTarget,
  toAiHostRuntimeScope,
} from './scope'

// ═══════════════════════════════════════════════════════
// Turn 工具（用户输入提取/turn 归一化/消息转换）
// ═══════════════════════════════════════════════════════

export {
  latestUserInput,
  normalizeTurn,
  toCurrentTurnMessages,
} from './turn-utils'

// ═══════════════════════════════════════════════════════
// 业务注册表（moduleId → 运行时实例管理）
// ═══════════════════════════════════════════════════════

export {
  AiHostBusinessRegistry,
} from './business-registry'

// ═══════════════════════════════════════════════════════
// 工具调用循环（LLM ↔ 业务工具多轮交互）
// ═══════════════════════════════════════════════════════

export {
  AiHostToolLoopRunner,
} from './tool-loop'

// ═══════════════════════════════════════════════════════
// 诊断工具（事件上报/payload 序列化/action 解析）
// ═══════════════════════════════════════════════════════

export {
  actionModuleId,
  emitLlmDiagnosticEvent,
  stringifyAiHostPayload,
} from './diagnostics'

// ═══════════════════════════════════════════════════════
// 消息发送（单次发送 + 持久会话工厂）
// ═══════════════════════════════════════════════════════

export {
  AiHostMessageSender,
  createAiHostBusinessSession,
} from './sending'

export type {
  AiHostSendContext,
  AiHostSendInput,
} from './sending'

// ═══════════════════════════════════════════════════════
// Fetch/SSE 传输实现（LLM 后端通信）
// ═══════════════════════════════════════════════════════

export {
  AiHostFetchTransport,
  parseAiHostSseBlocks,
  uploadAiHostAttachment,
} from './fetch-transport'

export type {
  AiHostFetch,
  AiHostFetchTransportOptions,
  AiHostHeadersProvider,
  AiHostParsedSseEvent,
  AiHostUploadedAttachment,
} from './fetch-transport'
