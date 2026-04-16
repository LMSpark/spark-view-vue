import { watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkComponentHost } from '../../internal'

interface LocalHostCapability {
  setHost: (host: SparkComponentHost) => void
}

export function useContainerHostBridge(
  localHost: LocalHostCapability,
  externalHost: ComputedRef<SparkComponentHost | undefined>,
): void {
  const hostProxy: SparkComponentHost = {
    get fieldMode(): string | undefined {
      return externalHost.value?.fieldMode
    },
    get variant(): string | undefined {
      return externalHost.value?.variant
    },
    isDisabled(action) {
      return externalHost.value?.isDisabled?.(action) ?? false
    },
    execute(action) {
      externalHost.value?.execute?.(action)
    },
  }

  watch(
    externalHost,
    (resolvedHost) => {
      if (resolvedHost !== undefined) {
        localHost.setHost(hostProxy)
      }
    },
    { immediate: true },
  )
}
