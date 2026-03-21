import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { SparkNode } from '../_pkg'

type MaybeRef<T> = Ref<T> | ComputedRef<T>

interface UseContainerInputOptions {
  config: MaybeRef<SparkNode | undefined>
  dataKey: MaybeRef<string | undefined>
  sparkChildren: MaybeRef<SparkNode[] | undefined>
}

interface UseContainerInputReturn {
  /** config.dataKey ?? config.props.dataKey ?? props.dataKey */
  effectiveDataKey: ComputedRef<string | undefined>
  /**
   * sparkChildren 多源解析（优先 props → config.props.sparkChildren → []）。
   * 用于 Table / Tree 等需要从 bindRules 注入和 config 两处取子节点的容器。
   */
  resolvedSparkChildren: ComputedRef<SparkNode[]>
  /**
   * 简化版子节点（config.children ?? sparkChildren ?? []）。
   * 用于 Form / Detail / List 等不需要二级 sparkChildren 解析的容器。
   */
  configChildren: ComputedRef<SparkNode[]>
  /**
   * 合并子节点（优先 config.children → resolvedSparkChildren）。
   * 用于 Table / Tree 需要区分 config 驱动与 sparkChildren 注入的场景。
   */
  mergedChildren: ComputedRef<SparkNode[]>
}

export function useContainerInput(options: UseContainerInputOptions): UseContainerInputReturn {
  const { config, dataKey, sparkChildren } = options

  const effectiveDataKey = computed(() =>
    config.value?.dataKey
    ?? (config.value?.props?.['dataKey'] as string | undefined)
    ?? dataKey.value
  )

  const resolvedSparkChildren = computed<SparkNode[]>(() => {
    const directChildren = sparkChildren.value
    if (Array.isArray(directChildren) && directChildren.length > 0) return directChildren

    const configSparkChildren = config.value?.props?.['sparkChildren'] as SparkNode[] | undefined
    if (Array.isArray(configSparkChildren) && configSparkChildren.length > 0) return configSparkChildren

    return []
  })

  const configChildren = computed<SparkNode[]>(() =>
    config.value?.children
    ?? sparkChildren.value
    ?? (config.value?.props?.['sparkChildren'] as SparkNode[] | undefined)
    ?? []
  )

  const mergedChildren = computed<SparkNode[]>(() => {
    const children = config.value?.children
    if (Array.isArray(children) && children.length > 0) return children
    return resolvedSparkChildren.value
  })

  return { effectiveDataKey, resolvedSparkChildren, configChildren, mergedChildren }
}
