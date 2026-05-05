/**
 * 核心方法调用运行时。
 *
 * 这个文件只负责两件最底层的事情：
 * 1. 把“按方法名调用目标对象”收敛成统一入口
 * 2. 把未知异常规范化成稳定的字符串消息
 *
 * 上层 builder 只需要关心目标解析、错误文案和副作用钩子，
 * 不再在业务层重复书写 Reflect.get 和 dispatch.call。
 */

/**
 * 功能分区一：底层调用结果模型
 * 时序说明：
 * 1. 先声明缺少方法与调用成功两种结果形状
 * 2. 再由公共调用入口返回统一联合类型
 */

/**
 * 目标对象缺少指定方法时的返回结果。
 * 输入语义：由底层调用入口在 Reflect.get 后发现成员不是函数时构造。
 * 输出语义：向上层明确返回 METHOD_NOT_FOUND 和缺失的方法名。
 * 调用时机：目标对象已解析成功，但不存在指定方法实现时使用。
 */
export interface InvocationMissingMethod {
  ok: false
  code: 'METHOD_NOT_FOUND'
  methodName: string
}

/**
 * 目标方法成功执行后的返回结果。
 * 输入语义：由底层调用入口在方法存在且成功执行后构造。
 * 输出语义：把原始返回值统一包进 data 字段，交给上层继续拼装 FunctionResult。
 * 调用时机：目标方法存在，且 dispatch.call 未抛出异常时使用。
 */
export interface InvocationSucceeded {
  ok: true
  data: unknown
}

/**
 * 底层方法调用的统一结果。
 * 输入语义：上层只需要判断 ok，即可区分缺少方法还是执行成功。
 * 输出语义：为上层 builder 提供稳定的分支判断基础，而不暴露 Reflect.get 细节。
 * 调用时机：所有按方法名调用目标对象的场景都使用这个联合类型承接结果。
 */
export type InvocationResult = InvocationMissingMethod | InvocationSucceeded

/**
 * 功能分区二：公共方法调用入口
 * 时序说明：
 * 1. 先从目标对象读取命名成员
 * 2. 确认成员是否为可调用函数
 * 3. 最后用目标对象自身作为 this 执行该方法
 */

/**
 * 按方法名调用目标对象上的命名方法。
 * 输入语义：接收目标对象、方法名和单个参数负载，不参与目标解析与错误文案定制。
 * 输出语义：返回 InvocationResult；若缺少方法则返回 METHOD_NOT_FOUND，若调用成功则返回原始 data。
 * 调用时机：上层已经定位好目标对象和方法名，准备进入统一底层分发时调用。
 */
export function invokeNamedMethod(target: unknown, methodName: string, params: unknown): InvocationResult {
  const member: unknown = Reflect.get(target as object, methodName)
  if (typeof member !== 'function') {
    return {
      ok: false,
      code: 'METHOD_NOT_FOUND',
      methodName,
    }
  }

  const dispatch = member as (this: object, payload?: unknown) => unknown
  return {
    ok: true,
    data: dispatch.call(target as object, params),
  }
}

/**
 * 功能分区三：错误消息归一化
 * 时序说明：
 * 1. 底层方法调用或上层 builder 捕获 unknown 错误
 * 2. 再把各种异常形状收敛成稳定字符串，交给业务错误结果继续拼装
 */

/**
 * 把 unknown 异常归一化为稳定字符串。
 * 输入语义：接收任意捕获到的异常对象或原始值。
 * 输出语义：如果是 Error，则返回 message；否则退化为 String(err)。
 * 调用时机：运行时 catch 到未知异常，需要继续构造可读错误结果时调用。
 */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}