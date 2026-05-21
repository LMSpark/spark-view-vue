/**
 * @packageDocumentation
 *
 * 模块语义协议 host 适配层入口。
 *
 * 复用旧 host 的 AiHostToolLoopRunner / AiHostFetchTransport / SSE 传输,
 * 适配模块语义协议(无状态、协议固定 6 工具)的会话与函数调用语义。
 *
 * 业务方典型使用:
 *
 * ```ts
 * import {
 *   ModuleSemanticRuntime,
 *   ModuleSemanticBusinessRuntime,
 * } from '@spark-view/spark-ai/module-semantic'
 *
 * const runtime = new ModuleSemanticRuntime()
 * runtime.registerKind(new NodeTreeModuleKind())
 * runtime.registerCapability(new NodeTreeCapability(...))
 *
 * const businessRuntime = new ModuleSemanticBusinessRuntime({
 *   moduleId: 'node-tree',
 *   runtime,
 * })
 *
 * // 喂给旧 host:
 * // const host = new AiHost({ registry: ..., transport })
 * // registry.register(businessRuntime)
 * ```
 */

export {
  ModuleSemanticBusinessRuntime,
} from './module-semantic-business-runtime'

export type {
  ModuleSemanticBusinessRuntimeOptions,
} from './module-semantic-business-runtime'

export {
  ModuleSemanticSessionStore,
} from './module-semantic-session-store'

export type {
  ModuleSemanticSessionStoreOptions,
  ModuleSemanticStartSessionOptions,
  ModuleSemanticAppendMessageOptions,
  ModuleSemanticAppendFunctionCallOptions,
} from './module-semantic-session-store'

export {
  ModuleSemanticToolCodec,
} from './module-semantic-tool-codec'
