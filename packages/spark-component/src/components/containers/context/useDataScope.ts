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

interface UseDataScopeReturn {
  context: UseSparkComponentReturn['context']
  sparkProvide: UseSparkComponentReturn['sparkProvide']
  sparkConsume: UseSparkComponentReturn['sparkConsume']
  logger: UseSparkComponentReturn['logger']
}

export function useDataScope(options: UseDataScopeOptions): UseDataScopeReturn {
  const { type, data, nodeConfig } = options

  const { context, sparkProvide, sparkConsume, logger } = useSparkComponent(
    nodeConfig ?? { type }
  )

  const mirror = shallowReactive<IDataRow>({})
  sparkProvide(DATA_ROW, mirror)

  watch(
    () => toValue(data),
    (incoming) => {
      const row: IDataRow = incoming
      const incomingKeys = new Set(Object.keys(row))

      for (const key of Object.keys(mirror)) {
        if (!incomingKeys.has(key)) {
          mirror[key] = undefined
        }
      }

      for (const key of incomingKeys) {
        if (mirror[key] !== row[key]) {
          mirror[key] = row[key]
        }
      }
    },
    { immediate: true },
  )

  return { context, sparkProvide, sparkConsume, logger }
}