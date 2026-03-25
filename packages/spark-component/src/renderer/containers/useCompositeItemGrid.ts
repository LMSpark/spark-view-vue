import { computed } from 'vue'
import type { ComputedRef, CSSProperties } from 'vue'
import { nodeInputProp, type SparkNode } from '../_pkg'
import { normalizeGridGap, normalizeSpan } from './useContainerGrid'

interface UseCompositeItemGridOptions {
  config: ComputedRef<SparkNode>
}

export function useCompositeItemGrid(options: UseCompositeItemGridOptions) {
  const contentChildren = computed(() => options.config.value.children ?? [])

  const contentBodyClass = computed(() => {
    const bodyClass = nodeInputProp(options.config.value, 'bodyClass')
    return typeof bodyClass === 'string' ? bodyClass : ''
  })

  const contentGridStyle = computed<CSSProperties>(() => {
    const columns = normalizeSpan(nodeInputProp(options.config.value, 'gridColumns'), 24)
    const autoRowsValue = nodeInputProp(options.config.value, 'gridAutoRows')
    const autoRows = typeof autoRowsValue === 'string' && autoRowsValue.trim().length > 0
      ? autoRowsValue
      : 'minmax(32px, auto)'

    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: normalizeGridGap(nodeInputProp(options.config.value, 'gridGap')),
      gridAutoRows: autoRows,
      alignItems: 'start',
    }
  })

  function getContentChildGridStyle(child: SparkNode): CSSProperties {
    const colSpan = normalizeSpan(
      nodeInputProp(child, 'colSpan') ?? nodeInputProp(child, 'gridColSpan') ?? nodeInputProp(child, 'span'),
      24,
    )
    const rowSpan = normalizeSpan(nodeInputProp(child, 'rowSpan') ?? nodeInputProp(child, 'gridRowSpan'), 1)
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