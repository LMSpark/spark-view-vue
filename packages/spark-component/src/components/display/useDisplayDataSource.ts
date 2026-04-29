/**
 * useDisplayDataSource — 轻量级数据读取 composable，供 display 组件使用
 *
 * 优先级：
 * 1. props.value（显式值）
 * 2. props.dataKey（值级 DataKey 解析，依赖 PAGE_DATASET）
 * 3. props.field（从 DATA_ROW / DATA_SOURCE.currentRow 读取字段）
 */
import { computed, type ComputedRef } from 'vue'
import { useSparkConsume, DATA_ROW, DATA_SOURCE } from '../internal'
import { PAGE_DATASET } from '../internal'
import { resolveRawKey } from '@spark-view/spark-data'
import { resolveCurrentRowPath } from '../support/row-selection-path'

interface DisplayDataProps {
  dataKey?: string | undefined
  field?: string | undefined
  value?: unknown
}

interface UseDisplayDataSourceReturn {
  resolvedValue: ComputedRef<unknown>
}

export function useDisplayDataSource(props: DisplayDataProps): UseDisplayDataSourceReturn {
  const { sparkConsume } = useSparkConsume()
  const contextData = sparkConsume(DATA_ROW)
  const dataSource = sparkConsume(DATA_SOURCE)
  const pageDataSet = sparkConsume(PAGE_DATASET)

  const resolvedValue = computed(() => {
    // 静态值优先（直接传入 value 的场景）
    if (props.value !== undefined) return props.value

    // 值级 dataKey 绑定：支持 summaryRow / currentRow / rows 等 DataKey 解析。
    if (typeof props.dataKey === 'string' && props.dataKey.trim().length > 0 && pageDataSet) {
      const boundValue = resolveRawKey(props.dataKey, pageDataSet)
      if (boundValue !== undefined) {
        // dataKey 可指向对象（如 summaryRow），field 再选择对象内字段。
        if (
          props.field
          && boundValue !== null
          && typeof boundValue === 'object'
          && !Array.isArray(boundValue)
          && props.field in boundValue
        ) {
          return (boundValue as Record<string, unknown>)[props.field]
        }
        return boundValue
      }
    }

    const activeRow = resolveCurrentRowPath(contextData, dataSource)
    // 从当前行数据读取字段
    if (activeRow !== null && props.field && props.field in activeRow) {
      return activeRow[props.field]
    }
    return undefined
  })

  return { resolvedValue }
}
