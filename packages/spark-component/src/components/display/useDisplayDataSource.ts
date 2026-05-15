/**
 * useDisplayDataSource — 轻量级数据读取 composable，供 display 组件使用
 *
 * 优先级：
 * 1. props.value（显式值）
 * 2. props.dataKey（DataView 输出读取，依赖 PAGE_DATASET）
 * 3. props.field（从 DATA_ROW / DATA_SOURCE.currentRow 读取字段）
 */
import { computed, type ComputedRef } from 'vue'
import { useSparkConsume, DATA_ROW, DATA_SOURCE } from '../internal'
import { PAGE_DATASET } from '../internal'
import { diagnoseDataKey, resolveRawKey } from '@spark-view/spark-data'

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

    // DataView 输出读取：支持 aggregateResult / currentRow / rows 等 DataKey 解析。
    if (typeof props.dataKey === 'string' && props.dataKey.trim().length > 0 && pageDataSet) {
      if (import.meta.env.DEV) {
        const diagnostic = diagnoseDataKey(props.dataKey, pageDataSet)
        if (!diagnostic.ok) {
          console.warn(`[DisplayDataSource] ${diagnostic.message}`)
        }
      }
      const boundValue = resolveRawKey(props.dataKey, pageDataSet)
      if (boundValue !== undefined) {
        // dataKey 可指向对象（如 aggregateResult），field 再选择对象内字段。
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

    const activeRow = contextData ?? dataSource?.currentRow ?? null
    // 从当前行数据读取字段
    if (activeRow !== null && props.field && props.field in activeRow) {
      return activeRow[props.field]
    }
    return undefined
  })

  return { resolvedValue }
}
