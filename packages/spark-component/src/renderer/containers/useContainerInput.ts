import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { SparkNode } from '../_pkg'

type MaybeRef<T> = Ref<T> | ComputedRef<T>

interface UseContainerInputOptions {
  dataKey: MaybeRef<string | undefined>
  children: MaybeRef<SparkNode[] | undefined>
}

interface UseContainerInputReturn {
  /** 已解析的 dataKey（直接来自 Props） */
  effectiveDataKey: ComputedRef<string | undefined>
  /** 子节点列表（直接来自 Props） */
  configChildren: ComputedRef<SparkNode[]>
}

export function useContainerInput(options: UseContainerInputOptions): UseContainerInputReturn {
  const { dataKey, children } = options

  const effectiveDataKey = computed(() => dataKey.value)

  const configChildren = computed<SparkNode[]>(() => {
    const c = children.value
    if (Array.isArray(c) && c.length > 0) return c
    return []
  })

  return { effectiveDataKey, configChildren }
}
