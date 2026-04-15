import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import { useContainerGrid } from './useContainerGrid'

interface UseCompositeItemGridOptions {
  children?: () => SparkNode['children'] | undefined
  bodyClass?: () => unknown
  gridColumns?: () => unknown
  gridAutoRows?: () => unknown
  gridGap?: () => unknown
}

export function useCompositeItemGrid(options: UseCompositeItemGridOptions) {
  const contentChildren = computed<SparkNode[]>(() => {
    const children = options.children?.()
    return getSparkNodeChildren(children)
  })

  const contentBodyClass = computed(() => {
    const bodyClass = options.bodyClass?.()
    return typeof bodyClass === 'string' ? bodyClass : ''
  })

  const {
    gridStyle: contentGridStyle,
    getChildGridStyle: getContentChildGridStyle,
  } = useContainerGrid({
    children: () => contentChildren.value,
    columns: () => {
      const value = options.gridColumns?.()
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10)
        if (Number.isFinite(parsed)) return parsed
      }
      return 24
    },
    gap: () => {
      const value = options.gridGap?.()
      return typeof value === 'number' || typeof value === 'string' ? value : 0
    },
    autoRows: () => {
      const value = options.gridAutoRows?.()
      return typeof value === 'string' ? value : ''
    },
  })

  return {
    contentChildren,
    contentBodyClass,
    contentGridStyle,
    getContentChildGridStyle,
  }
}