import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'
import type { IModuleContext } from '@spark-view/spark-utils'
import type { ModuleContextCapability } from '../_pkg'

/**
 * 封装 MODULE_CONTEXT 能力的订阅/取消订阅生命周期。
 *
 * 容器组件只需调用一次 `useModuleContext(capability)`，
 * 即可获得响应式的 `moduleContext` ref，组件卸载时自动取消订阅。
 */
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
