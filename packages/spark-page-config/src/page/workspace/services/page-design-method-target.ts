import {
  pageDesignServiceFailure,
  pageDesignServiceSuccess,
  type PageDesignServiceMethodBinding,
  type PageDesignServiceResult,
} from './page-design-service-contract'

interface TargetMethodMissing {
  ok: false
  code: 'METHOD_NOT_FOUND'
  methodName: string
}

interface TargetMethodSucceeded {
  ok: true
  data: unknown
}

/**
 * 步骤 1：按函数目录登记的 methodName 调用宿主对象。
 *
 * 这里不做任何“相似方法名”兜底，目标不是对象或成员不是函数都会返回 METHOD_NOT_FOUND。
 * PageDesign 的工具注册表与宿主实现必须一一对应，否则应尽早暴露配置/实现不一致。
 */
function useNamedMethod(target: unknown, methodName: string, params: unknown): TargetMethodMissing | TargetMethodSucceeded {
  if (target === null || typeof target !== 'object') {
    return {
      ok: false,
      code: 'METHOD_NOT_FOUND',
      methodName,
    }
  }

  const member: unknown = Reflect.get(target, methodName)
  if (typeof member !== 'function') {
    return {
      ok: false,
      code: 'METHOD_NOT_FOUND',
      methodName,
    }
  }

  return {
    ok: true,
    data: member.call(target, params),
  }
}

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
 * 步骤 2：把宿主方法返回值转成可跨协议传输的数据。
 *
 * SparkNodeTree / DataSet tool 这类运行态对象可能带有方法、循环引用或 BigInt。
 * 本函数优先尊重对象自己的 toJson；随后用 JSON.stringify replacer 处理循环引用和
 * BigInt，保证返回给 AI runtime 的结果是稳定的 JSON 形态。
 */
function toSerializableServiceData(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const toJson = readToJson(value)
  if (toJson !== null) {
    return toSerializableServiceData(toJson())
  }
  if (Array.isArray(value)) return value.map(toSerializableServiceData)

  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, nested: unknown) => {
    if (typeof nested === 'bigint') return nested.toString()
    if (nested === null || typeof nested !== 'object') return nested
    const nestedToJson = readToJson(nested)
    if (nestedToJson !== null) {
      return toSerializableServiceData(nestedToJson())
    }
    if (seen.has(nested)) return '[Circular]'
    seen.add(nested)
    return nested
  })
  return JSON.parse(serialized)
}

/** 步骤 3：把未知异常归一成可放入 PageDesignServiceResult 的字符串。 */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useMethodBackedTarget(
  options: PageDesignServiceMethodBinding,
  target: unknown,
  args: unknown,
): PageDesignServiceResult<unknown> {
  try {
    const targetMethod = useNamedMethod(target, options.methodName, args)
    if (!targetMethod.ok) {
      return pageDesignServiceFailure(
        'METHOD_NOT_FOUND',
        `${options.serviceLabel}: method "${options.methodName}" not found on target`,
        options.fixHint ?? '确认宿主对象实现了对应方法。',
      )
    }
    return pageDesignServiceSuccess(toSerializableServiceData(targetMethod.data), `${options.serviceLabel} 完成`)
  } catch (error) {
    return pageDesignServiceFailure(
      'METHOD_ERROR',
      toErrorMessage(error),
      options.fixHint ?? '检查输入参数和宿主方法实现。',
    )
  }
}
