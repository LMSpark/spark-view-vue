import { watch } from 'vue'
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

  watch(
    () => toValue(data),
    (d) => { sparkProvide(DATA_ROW, d) },
    { immediate: true },
  )

  return { context, sparkProvide, sparkConsume, logger }
}