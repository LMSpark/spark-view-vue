import { computed, type ComputedRef } from 'vue'
import type { SparkCapabilityContext } from './types.js'
import { useSparkComponent, useSparkConsume } from './useSparkComponent.js'
import type { UseSparkCapabilityReaderReturn, UseSparkComponentOptions, UseSparkComponentReturn } from './useSparkComponent.js'
import type { SparkCapabilityConsumer } from './capabilities.js'

export interface SparkHostResolverOptions<T extends string = string> {
  hostTypes?: readonly T[]
  aliases?: Readonly<Record<string, T>>
  fallbackType?: T | null
}

export interface ResolvedSparkHost<T extends string = string> {
  hostType: T | null
  hostContext: SparkCapabilityContext | null
}

export interface UseSparkHostReturn<T extends string = string> {
  host: ComputedRef<UseSparkCapabilityReaderReturn['host']>
  hostType: ComputedRef<T | null>
  hostContext: ComputedRef<SparkCapabilityContext | null>
  sparkConsume: SparkCapabilityConsumer
}

export type UseSparkHostScopeReturn = UseSparkComponentReturn

function normalizeHostType<T extends string>(
  type: string,
  options: SparkHostResolverOptions<T>,
): T | null {
  const aliasType = options.aliases?.[type]
  if (aliasType !== undefined) return aliasType

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
    hostType: options.fallbackType ?? null,
    hostContext: null,
  }
}

export function useSparkHost<T extends string = string>(
  options: SparkHostResolverOptions<T> = {},
): UseSparkHostReturn<T> {
  const { host, sparkConsume } = useSparkConsume()

  const resolvedHost = computed(() => resolveSparkHost(host.type, host.context, options))

  return {
    host: computed(() => host),
    hostType: computed(() => resolvedHost.value.hostType),
    hostContext: computed(() => resolvedHost.value.hostContext),
    sparkConsume,
  }
}

export function useSparkHostScope(
  type: string,
  options?: UseSparkComponentOptions,
): UseSparkHostScopeReturn {
  return useSparkComponent({ type }, options)
}