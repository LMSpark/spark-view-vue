type UnknownPolicy = 'ignore' | 'warn' | 'error'

interface MinimalLogger {
  warn?: (message: string, payload?: Record<string, unknown>) => void
  error?: (message: string, payload?: Record<string, unknown>) => void
}

export interface MapNodePropsOptions<TTarget extends object> {
  source: Readonly<Record<string, unknown>> | undefined
  map: Record<keyof TTarget, string>
  ignoreSourceKeys?: string[]
  context: string
  unknownPolicy?: UnknownPolicy
  logger?: MinimalLogger
}

/**
 * 将结构化节点 props 显式映射到目标组件 props。
 *
 * - 支持 sourceKey -> targetKey 改名映射
 * - 支持未落地 sourceKey 的 warn / error 策略
 */
export function mapNodeProps<TTarget extends object>(
  options: MapNodePropsOptions<TTarget>,
): Partial<TTarget> {
  const source = options.source
  if (!source) return {}

  const mapped: Partial<TTarget> = {}
  const consumedSourceKeys = new Set<string>()

  for (const [targetKey, sourceKey] of Object.entries(options.map) as Array<[keyof TTarget, string]>) {
    consumedSourceKeys.add(sourceKey)
    const value = source[sourceKey]
    if (value !== undefined) {
      ;(mapped as Record<string, unknown>)[targetKey as string] = value
    }
  }

  const ignored = new Set(options.ignoreSourceKeys ?? [])
  const unknownSourceKeys = Object.keys(source).filter((key) => !consumedSourceKeys.has(key) && !ignored.has(key))
  if (unknownSourceKeys.length === 0) return mapped

  const context = options.context
  const message = `[prop-map] ${context} 存在未落地属性: ${unknownSourceKeys.join(', ')}`
  const payload = { context, unknownSourceKeys, source }
  const policy = options.unknownPolicy ?? 'error'

  if (policy === 'warn') {
    options.logger?.warn?.(message, payload)
    return mapped
  }

  if (policy === 'error') {
    options.logger?.error?.(message, payload)
    throw new Error(message)
  }

  return mapped
}
