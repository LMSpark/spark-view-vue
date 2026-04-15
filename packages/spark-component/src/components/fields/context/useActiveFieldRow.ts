import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { DATA_ROW, DATA_SOURCE, useSparkConsume } from '../../internal'

export function useActiveFieldRow() {
  const { sparkConsume } = useSparkConsume()
  const contextData = sparkConsume(DATA_ROW)
  const dataSource = sparkConsume(DATA_SOURCE)

  const activeRow = computed<IDataRow | null>(() => {
    if (contextData !== null) return contextData
    return dataSource?.currentRow ?? null
  })

  return {
    contextData,
    dataSource,
    activeRow,
  }
}
