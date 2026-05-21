/**
 * @packageDocumentation
 *
 * SPARK AI 公共入口。
 *
 * 本包只暴露三块稳定能力：
 * - schema：LLM JSON Schema 类型、构造器和参数校验。
 * - module-semantic：ModuleKind 语义协议和 ModuleSemanticRuntime。
 * - host：框架无关的 Host 会话、传输和工具循环。
 *
 * 旧 runtime / protocol / core 入口已经删除，不再提供兼容导出。
 */

export * from './schema'

export * from './module-semantic'

export * from './host'
