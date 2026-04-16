import type { SparkCapabilityContext } from './types.js'
import { useSparkComponent } from './useSparkComponent.js'
import type { UseSparkComponentOptions, UseSparkComponentReturn } from './useSparkComponent.js'

interface SparkHostResolverOptions<T extends string = string> {
  hostTypes?: readonly T[]
}

interface ResolvedSparkHost<T extends string = string> {
  hostType: T | null
  hostContext: SparkCapabilityContext | null
}

function normalizeHostType<T extends string>(
  type: string,
  options: SparkHostResolverOptions<T>,
): T | null {
  if (options.hostTypes === undefined) {
    return type as T
  }

  return options.hostTypes.includes(type as T) ? (type as T) : null
}

export function resolveSparkHost<T extends string = string>(
  hostType: string | null,
  hostContext: SparkCapabilityContext | null,
  options: SparkHostResolverOptions<T> = {},
): ResolvedSparkHost<T> {
  let currentType = hostType
  let currentContext = hostContext

  while (currentType !== null) {
    const normalizedType = normalizeHostType(currentType, options)
    if (normalizedType !== null) {
      return {
        hostType: normalizedType,
        hostContext: currentContext,
      }
    }

    currentContext = currentContext?.parent ?? null
    currentType = typeof currentContext?.type === 'string' ? currentContext.type : null
  }

  return {
    hostType: null,
    hostContext: null,
  }
}

export function useSparkHostScope(
  type: string,
  options?: UseSparkComponentOptions,
): UseSparkComponentReturn {
  return useSparkComponent({ type }, options)
}