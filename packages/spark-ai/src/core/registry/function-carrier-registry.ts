import type { FunctionCarrierContract, FunctionCarrierKey } from '../protocol/function-contracts'
import { actionToCarrierKey } from '../protocol/invocation-helpers'

/**
 * 运行载体注册表。
 *
 * 职责边界：
 * 1. 维护 carrierKey -> FunctionCarrierContract 的内存级索引。
 * 2. 为 dispatcher、knowledge、tool schema 层提供模块级实例、提示词与事件钩子读取入口。
 * 3. 只处理载体注册与查询，不承担函数执行、参数校验或业务状态变更职责。
 *
 * 时序主线：
 * 1. 业务模块初始化时先创建各模块 carrier，并注册到本表。
 * 2. runtime 通过 action 推导 carrierKey，读取对应 carrier.instance / prompt / hooks。
 * 3. knowledge / schema 层读取 carrier prompt 与 isPrimary 等模块级元信息。
 * 4. 会话重置时清空 carrier registry，避免模块实例跨会话泄漏。
 */

/**
 * 载体注册表底层存储。
 *
 * 这里统一以 unknown 作为底层实例擦除后的存储类型：
 * - 注册时保留泛型入口，确保业务层创建 carrier 时仍有强类型体验。
 * - 存储时擦除为 unknown，避免 FunctionCarrierContract<T> 在 hook 参数逆变位置上互不兼容。
 */
const carrierRegistry = new Map<FunctionCarrierKey, FunctionCarrierContract<unknown>>()

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区一：注册入口
// 时序：业务模块先构造 carrier，再通过单个或批量接口写入 registry。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 注册单个运行载体。
 * 输入语义：接收一个带泛型实例类型的 FunctionCarrierContract。
 * 输出语义：以 carrier.carrierKey 为主键写入 registry；若主键重复则覆盖旧值。
 * 调用时机：业务模块只需注册单个 carrier，或测试中构造最小 carrier 集时使用。
 */
export function registerFunctionCarrier<TInstance>(carrier: FunctionCarrierContract<TInstance>): void {
  carrierRegistry.set(carrier.carrierKey, carrier as FunctionCarrierContract<unknown>)
}

/**
 * 批量注册运行载体。
 * 输入语义：接收一组同构泛型视角下的 carriers。
 * 输出语义：逐条写入 registry；后写入的同名 carrierKey 会覆盖旧值。
 * 调用时机：业务模块初始化时集中注册 lifecycle / dataset / textModel 等多个模块载体。
 */
export function registerFunctionCarriers<TInstance>(carriers: ReadonlyArray<FunctionCarrierContract<TInstance>>): void {
  for (const carrier of carriers) {
    carrierRegistry.set(carrier.carrierKey, carrier as FunctionCarrierContract<unknown>)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区二：查询入口
// 时序：注册完成后，runtime / knowledge 按 carrierKey 或 action 两种视角读取载体。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 按 carrierKey 查询单个运行载体。
 * 输入语义：接收已归一化的 business@module 载体键。
 * 输出语义：命中则返回对应 carrier，未命中返回 undefined。
 * 调用时机：已知模块键，直接读取模块实例、提示词或 before/after hook 时使用。
 */
export function getFunctionCarrier(carrierKey: FunctionCarrierKey): FunctionCarrierContract<unknown> | undefined {
  return carrierRegistry.get(carrierKey)
}

/**
 * 按 action 查询所属运行载体。
 * 输入语义：接收完整 action 地址。
 * 输出语义：内部先推导 carrierKey，再返回对应模块载体；若未命中则返回 undefined。
 * 调用时机：dispatcher 执行函数前按 action 找载体，是最常见的 carrier 查询入口。
 */
export function getFunctionCarrierByAction(action: string): FunctionCarrierContract<unknown> | undefined {
  return carrierRegistry.get(actionToCarrierKey(action))
}

/**
 * 读取全部运行载体视图。
 * 输入语义：无输入。
 * 输出语义：返回 carrier registry 的只读视图，供知识层或调试层做模块目录扫描。
 * 调用时机：需要全量遍历所有模块载体、做 prompt 投影或调试诊断时使用。
 */
export function getAllFunctionCarriers(): ReadonlyMap<FunctionCarrierKey, FunctionCarrierContract<unknown>> {
  return carrierRegistry
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区四：生命周期清理
// 时序：会话切换、测试隔离或业务重建前，最后统一清空 carrier registry。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 清空运行载体注册表。
 * 输入语义：无输入。
 * 输出语义：移除当前会话中所有 carrier，确保模块实例不会跨会话残留。
 * 调用时机：测试前置清理、session reset、重新装配业务模块 carrier 前使用。
 */
export function clearFunctionCarrierRegistry(): void {
  carrierRegistry.clear()
}