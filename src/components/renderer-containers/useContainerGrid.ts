import { computed } from 'vue'
import type { CSSProperties, Ref } from 'vue'
import type { ComponentConfig } from '@spark-view/spark-component'

const DEFAULT_GRID_COLUMNS = 24
const DEFAULT_GRID_GAP = '0px'
const DEFAULT_AUTO_ROWS = 'minmax(32px, auto)'

function normalizeGridGap(value: number | string | undefined): string {
  if (typeof value === 'number') return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return DEFAULT_GRID_GAP
}

function normalizeSpan(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value))
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return Math.max(1, parsed)
  }
  return fallback
}

function getSpanValue(child: ComponentConfig, keys: string[], fallback: number): number {
  const props = child.props ?? {}
  for (const key of keys) {
    const value = props[key]
    if (value !== undefined) return normalizeSpan(value, fallback)
  }
  return fallback
}

export interface UseContainerGridOptions {
  children: Ref<ComponentConfig[]>
  columns?: Ref<number>
  gap?: Ref<number | string>
  autoRows?: Ref<string>
}

export function useContainerGrid(options: UseContainerGridOptions) {
  const columns = options.columns ?? computed(() => DEFAULT_GRID_COLUMNS)
  const gap = options.gap ?? computed(() => DEFAULT_GRID_GAP)
  const autoRows = options.autoRows ?? computed(() => DEFAULT_AUTO_ROWS)

  const gridStyle = computed<CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${Math.max(columns.value, 1)}, minmax(0, 1fr))`,
    gap: normalizeGridGap(gap.value),
    gridAutoRows: autoRows.value || DEFAULT_AUTO_ROWS,
    alignItems: 'start',
  }))

  function getChildGridStyle(child: ComponentConfig): CSSProperties {
    const colSpan = getSpanValue(child, ['colSpan', 'gridColSpan', 'span'], 24)
    const rowSpan = getSpanValue(child, ['rowSpan', 'gridRowSpan'], 1)

    return {
      gridColumn: `span ${colSpan} / span ${colSpan}`,
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
      minWidth: 0,
    }
  }

  return {
    gridStyle,
    getChildGridStyle,
    gridChildren: options.children,
  }
}