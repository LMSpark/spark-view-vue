import {
  pageDesignServiceFailure,
  pageDesignServiceSuccess,
  type PageDesignServiceActionBinding,
  type PageDesignServiceResult,
} from './page-design-service-contract'

/** 判断对象是否提供 toJson 序列化能力；只用于运行态对象转服务响应。 */
function hasToJson(value: object): value is { toJson: () => unknown } {
  return 'toJson' in value && typeof value.toJson === 'function'
}

/** 把 toJson 读取封装成函数，供递归序列化流程统一处理。 */
function readToJson(value: object): (() => unknown) | null {
  if (!hasToJson(value)) return null
  return () => value.toJson()
}

/**
 * 把业务 action 返回值转成可跨协议传输的数据。
 *
 * SparkNodeTree / DataSet tool 这类运行态对象可能带有方法、循环引用或 BigInt。
 * 本函数优先尊重对象自己的 toJson；随后用 JSON.stringify replacer 处理循环引用和
 * BigInt，保证返回给 AI 协议的结果是稳定的 JSON 形态。
 */
function toSerializableServiceData(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const toJson = readToJson(value)
  if (toJson !== null) {
    return toSerializableServiceData(toJson())
  }
  if (Array.isArray(value)) return value.map(toSerializableServiceData)
  if (value instanceof Set) return [...value].map(toSerializableServiceData)
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), toSerializableServiceData(item)]))

  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, nested: unknown) => {
    if (typeof nested === 'bigint') return nested.toString()
    if (nested === null || typeof nested !== 'object') return nested
    const nestedToJson = readToJson(nested)
    if (nestedToJson !== null) {
      return toSerializableServiceData(nestedToJson())
    }
    if (nested instanceof Set) return [...nested].map(toSerializableServiceData)
    if (nested instanceof Map) return Object.fromEntries([...nested].map(([key, item]) => [String(key), toSerializableServiceData(item)]))
    if (seen.has(nested)) return '[Circular]'
    seen.add(nested)
    return nested
  })
  return JSON.parse(serialized)
}

/** 把未知异常归一成可放入 PageDesignServiceResult 的字符串。 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runRegisteredActionTarget<TTarget>(
  options: PageDesignServiceActionBinding<TTarget>,
  target: TTarget,
  args: unknown,
): Promise<PageDesignServiceResult<unknown>> {
  try {
    const data = await options.run(target, args)
    return pageDesignServiceSuccess(toSerializableServiceData(data), `${options.serviceLabel} 完成`)
  } catch (error) {
    return pageDesignServiceFailure(
      'ACTION_ERROR',
      toErrorMessage(error),
      options.fixHint ?? '检查输入参数和业务 action 实现。',
    )
  }
}
