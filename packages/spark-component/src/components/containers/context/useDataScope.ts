import { shallowReactive, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { useSparkComponent } from '../../internal'
import type { SparkNode, UseSparkComponentReturn } from '../../internal'
import { DATA_ROW } from '../../internal'
import type { IDataRow } from '@spark-view/spark-data'

interface UseDataScopeOptions {
  type: string
  data: MaybeRefOrGetter<IDataRow>
  nodeConfig?: SparkNode
}

type UseDataScopeReturn = Pick<UseSparkComponentReturn, 'host' | 'sparkProvide' | 'sparkConsume' | 'logger'>

export function useDataScope(options: UseDataScopeOptions): UseDataScopeReturn {
  const { type, data, nodeConfig } = options

  const { host, sparkProvide, sparkConsume, logger } = useSparkComponent(
    nodeConfig ?? { type }
  )

  const mirror = shallowReactive<IDataRow>({})
  sparkProvide(DATA_ROW, mirror)

  let syncingFromSource = false
  let syncingFromMirror = false

  function syncRow(target: IDataRow, source: IDataRow): void {
    const incomingKeys = new Set(Object.keys(source))

    for (const key of Object.keys(target)) {
      if (!incomingKeys.has(key)) {
        target[key] = undefined
      }
    }

    for (const key of incomingKeys) {
      if (target[key] !== source[key]) {
        target[key] = source[key]
      }
    }
  }

  watch(
    () => toValue(data),
    (incoming) => {
      if (syncingFromMirror) return
      syncingFromSource = true
      try {
        const row: IDataRow = incoming
        syncRow(mirror, row)
      } finally {
        syncingFromSource = false
      }
    },
    { immediate: true, deep: true },
  )

  watch(
    mirror,
    (incoming) => {
      if (syncingFromSource) return
      const row = toValue(data)
      syncingFromMirror = true
      try {
        syncRow(row, incoming)
      } finally {
        syncingFromMirror = false
      }
    },
    { deep: true },
  )

  const result: UseDataScopeReturn = { host, sparkProvide, sparkConsume, logger }
  return result
}