import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'
import type { IModuleContext } from '@spark-view/spark-utils'
import type { ModuleContextCapability } from '../../internal'

export function useModuleContext(
  capability: ModuleContextCapability | null,
): Ref<IModuleContext | null> {
  const moduleContext = ref<IModuleContext | null>(capability?.getCurrent() ?? null)

  const unsubscribe = capability?.subscribe((next) => {
    moduleContext.value = next
  }) ?? null

  onUnmounted(() => {
    unsubscribe?.()
  })

  return moduleContext
}