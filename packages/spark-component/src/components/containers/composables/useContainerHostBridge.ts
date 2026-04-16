import { watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { SparkHostLink } from '../../internal'

interface LocalHostCapability {
  setHost: (host: SparkHostLink | undefined) => void
}

export function useContainerHostBridge(
  localHost: LocalHostCapability,
  externalHost: ComputedRef<SparkHostLink | undefined>,
): void {
  watch(
    externalHost,
    (resolvedHost) => {
      if (resolvedHost === undefined) {
        localHost.setHost(undefined)
        return
      }

      localHost.setHost(resolvedHost)
    },
    { immediate: true },
  )
}
