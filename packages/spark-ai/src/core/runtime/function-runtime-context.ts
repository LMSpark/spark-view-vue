import type { FunctionRuntimeContext } from '../protocol/function-contracts'

/**
 * 函数运行时上下文工厂。
 *
 * 职责边界：
 * 1. 为每轮函数执行会话创建独立的运行时上下文实例。
 * 2. 提供 patchLog 容器，以及默认的 carrier before/after 事件发射行为。
 * 3. 这里只负责实例化，不负责函数注册、执行或业务状态管理。
 */

/**
 * 创建新的函数运行时上下文。
 * 输入语义：无输入。
 * 输出语义：返回带空 patchLog 与默认 before/after emitter 的全新上下文对象。
 * 调用时机：会话初始化、测试隔离、或需要新建一轮独立函数执行现场时调用。
 */
export function createFunctionRuntimeContext(): FunctionRuntimeContext {
  return {
    patchLog: [],
    emitBeforeExecute: (carrier, event, context) => carrier.beforeExecute?.({ context, carrier, event }) ?? null,
    emitAfterExecute: (carrier, event, context) => carrier.afterExecute?.({ context, carrier, event }),
  }
}