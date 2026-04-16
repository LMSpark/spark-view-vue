import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { DATA_ROW, DATA_SOURCE, useSparkConsume } from '../../internal'
import { resolveCurrentRowPath, resolveSelectedRowsPath } from '../../support/row-selection-path'

export function useActiveFieldRow() {
  const { sparkConsume } = useSparkConsume()
  const contextData = sparkConsume(DATA_ROW)
  const dataSource = sparkConsume(DATA_SOURCE)

  const activeRow = computed<IDataRow | null>(() => {
    return resolveCurrentRowPath(contextData, dataSource)
  })

  const activeSelectedRows = computed<IDataRow[]>(() => {
    return resolveSelectedRowsPath(dataSource)
  })

  return {
    contextData,
    dataSource,
    activeRow,
    activeSelectedRows,
  }
}
