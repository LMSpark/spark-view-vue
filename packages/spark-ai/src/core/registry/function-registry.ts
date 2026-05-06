import type { RegisteredFunctionDefinition } from '../protocol/function-contracts'

/**
 * 函数定义注册表。
 *
 * 职责边界：
 * 1. 维护 action -> RegisteredFunctionDefinition 的内存级索引。
 * 2. 为 runtime / knowledge / schema 生成层提供统一读取入口。
 * 3. 只负责注册、查询、清空，不承担执行、校验或提示词投影职责。
 *
 * 时序主线：
 * 1. 会话或业务模块启动时先注册单个/批量函数定义。
 * 2. 运行时根据 action 查询对应 definition。
 * 3. 知识层或 tool schema 层读取全部 definitions 做目录投影。
 * 4. 会话重置时清空 registry，避免跨会话污染。
 */

/**
 * 注册表底层存储。
 *
 * - key  : 规范 action，格式固定为 business@module@function。
 * - value: 已整理好的可执行函数定义。
 */
const registry = new Map<string, RegisteredFunctionDefinition<unknown, unknown>>()

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区一：注册入口
// 时序：业务层先声明 definition，再通过单个或批量注册接口写入 registry。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 注册单个函数定义。
 * 输入语义：接收一条完整的 RegisteredFunctionDefinition。
 * 输出语义：以 definition.action 作为主键写入 registry；若 action 已存在则覆盖旧值。
 * 调用时机：仅需注册单个函数，或测试中构造最小 definition 集合时使用。
 */
export function registerFunction<TParams, TResult>(definition: RegisteredFunctionDefinition<TParams, TResult>): void {
  registry.set(definition.action, definition as RegisteredFunctionDefinition<unknown, unknown>)
}

/**
 * 批量注册函数定义。
 * 输入语义：接收一组已构建好的函数定义数组。
 * 输出语义：逐条写入 registry；后写入的同名 action 会覆盖先前值。
 * 调用时机：业务模块初始化时批量装配函数目录，是最常见的注册入口。
 */
export function registerFunctions<TDefinition extends RegisteredFunctionDefinition<never, unknown>>(definitions: readonly TDefinition[]): void {
  for (const definition of definitions) {
    registerFunction(definition)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区二：查询入口
// 时序：注册完成后，runtime 和 knowledge 按 action 或全量视角读取 registry。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 按 action 查询单个函数定义。
 * 输入语义：传入规范 action 地址。
 * 输出语义：命中则返回对应 RegisteredFunctionDefinition，未命中返回 undefined。
 * 调用时机：function dispatcher 执行前定位 definition，或知识层按 action 查询指南时使用。
 */
export function getFunctionDefinition(action: string): RegisteredFunctionDefinition<unknown, unknown> | undefined {
  return registry.get(action)
}

/**
 * 读取全部函数定义视图。
 * 输入语义：无输入。
 * 输出语义：返回 registry 的只读视图，供上层做目录扫描、tool schema 生成或相似 action 检索。
 * 调用时机：knowledge query、tool definition 生成、候选 action 检索等全量投影场景使用。
 */
export function getAllFunctionDefinitions(): ReadonlyMap<string, RegisteredFunctionDefinition<unknown, unknown>> {
  return registry
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区三：生命周期清理
// 时序：会话切换、测试隔离或业务重置时，最后统一清空 registry。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 清空函数定义注册表。
 * 输入语义：无输入。
 * 输出语义：移除当前会话内已注册的全部 function definitions。
 * 调用时机：测试前置清理、会话 reset、重新装配新一轮函数目录前使用。
 */
export function clearFunctionRegistry(): void {
  registry.clear()
}