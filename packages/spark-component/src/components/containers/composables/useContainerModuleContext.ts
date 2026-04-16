import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'
import type { IModuleContext } from '../../internal'
import type { ModuleContextCapability } from '../../internal'

export function useContainerModuleContext(
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