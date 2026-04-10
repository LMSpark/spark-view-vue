/**
 * useDisplayDataSource — 轻量级数据读取 composable，供 display 组件使用
 *
 * 1. 如果组件有 field prop → 从父容器的 DATA_ROW（currentRow）读取字段值
 * 2. 如果值由 props 静态传入 → 直接使用
 *
 * 不做自解析 dataKey（display 组件不是 self-resolve 容器），
 * bindRules 阶段已将 dataKey 解析为具体数据注入 props。
 */
import { computed, type ComputedRef } from 'vue'
import { useSparkConsume, DATA_ROW } from '../internal'

interface DisplayDataProps {
  field?: string | undefined
  value?: unknown
}

interface UseDisplayDataSourceReturn {
  resolvedValue: ComputedRef<unknown>
}

export function useDisplayDataSource(props: DisplayDataProps): UseDisplayDataSourceReturn {
  const { sparkConsume } = useSparkConsume()
  const contextData = sparkConsume(DATA_ROW)

  const resolvedValue = computed(() => {
    // 静态值优先（直接传入 value 的场景）
    if (props.value !== undefined) return props.value
    // 从当前行数据读取字段
    if (contextData !== null && props.field && props.field in contextData) {
      return contextData[props.field]
    }
    return undefined
  })

  return { resolvedValue }
}
