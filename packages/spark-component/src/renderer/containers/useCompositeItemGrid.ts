import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../_pkg'
import { normalizeGridGap, normalizeSpan } from './useContainerGrid'

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

  const contentGridStyle = computed<CSSProperties>(() => {
    const columns = normalizeSpan(options.gridColumns?.(), 24)
    const autoRowsValue = options.gridAutoRows?.()
    const autoRows = typeof autoRowsValue === 'string' && autoRowsValue.trim().length > 0
      ? autoRowsValue
      : 'minmax(32px, auto)'

    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: normalizeGridGap(options.gridGap?.()),
      gridAutoRows: autoRows,
      alignItems: 'start',
    }
  })

  function getContentChildGridStyle(child: SparkNode): CSSProperties {
    const childProps = child.props ?? {}
    const colSpan = normalizeSpan(
      childProps['colSpan'] ?? childProps['gridColSpan'] ?? childProps['span'],
      24,
    )
    const rowSpan = normalizeSpan(childProps['rowSpan'] ?? childProps['gridRowSpan'], 1)
    return {
      gridColumn: `span ${colSpan} / span ${colSpan}`,
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
      minWidth: 0,
    }
  }

  return {
    contentChildren,
    contentBodyClass,
    contentGridStyle,
    getContentChildGridStyle,
  }
}