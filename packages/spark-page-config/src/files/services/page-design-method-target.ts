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

type TargetMethodResult = TargetMethodMissing | TargetMethodSucceeded

function useNamedMethod(target: unknown, methodName: string, params: unknown): TargetMethodResult {
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

function hasToJson(value: object): value is { toJson: () => unknown } {
  return 'toJson' in value && typeof value.toJson === 'function'
}

function readToJson(value: object): (() => unknown) | null {
  if (!hasToJson(value)) return null
  return () => value.toJson()
}

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
