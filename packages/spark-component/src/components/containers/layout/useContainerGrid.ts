import { computed, toValue } from 'vue'
import type { CSSProperties, MaybeRefOrGetter } from 'vue'
import { nodeInputProp, type SparkNode } from '../../internal'

const DEFAULT_GRID_COLUMNS = 24
const DEFAULT_GRID_GAP = '0px'
const DEFAULT_AUTO_ROWS = 'minmax(32px, auto)'

export function normalizeGridGap(value: unknown): string {
  if (typeof value === 'number') return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return DEFAULT_GRID_GAP
}

export function normalizeSpan(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value))
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return Math.max(1, parsed)
  }
  return fallback
}

function getSpanValue(child: SparkNode, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = nodeInputProp(child, key)
    if (value !== undefined) return normalizeSpan(value, fallback)
  }
  return fallback
}

interface UseContainerGridOptions {
  children: MaybeRefOrGetter<SparkNode[]>
  columns?: MaybeRefOrGetter<number>
  gap?: MaybeRefOrGetter<number | string>
  autoRows?: MaybeRefOrGetter<string>
  autoFitMinWidth?: MaybeRefOrGetter<string>
  defaultColSpan?: MaybeRefOrGetter<number>
  /** 当最后一行不满时，自动拉宽以填满行宽 */
  autoFillLastRow?: boolean
}

export function useContainerGrid(options: UseContainerGridOptions) {
  const gridStyle = computed<CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: toValue(options.autoFitMinWidth ?? '').trim().length > 0
      ? `repeat(auto-fit, minmax(${toValue(options.autoFitMinWidth ?? '')}, 1fr))`
      : `repeat(${Math.max(toValue(options.columns ?? DEFAULT_GRID_COLUMNS), 1)}, minmax(0, 1fr))`,
    gap: normalizeGridGap(toValue(options.gap ?? DEFAULT_GRID_GAP)),
    gridAutoRows: toValue(options.autoRows ?? DEFAULT_AUTO_ROWS) || DEFAULT_AUTO_ROWS,
    alignItems: 'start',
  }))

  function getChildGridStyle(child: SparkNode, index?: number): CSSProperties {
    const colSpan = getSpanValue(child, ['colSpan', 'gridColSpan', 'span'], toValue(options.defaultColSpan ?? DEFAULT_GRID_COLUMNS))
    const rowSpan = getSpanValue(child, ['rowSpan', 'gridRowSpan'], 1)

    let finalColSpan = colSpan

    // 当启用自动拉宽且提供了索引时，计算最后一行是否需要拉宽
    if (options.autoFillLastRow && index !== undefined) {
      const children = toValue(options.children)
      const columns = toValue(options.columns ?? DEFAULT_GRID_COLUMNS)
      const itemsPerRow = Math.max(1, Math.floor(columns / colSpan))
      const lastRowStartIndex = Math.floor(children.length / itemsPerRow) * itemsPerRow

      // 如果当前项在最后一行且最后一行不满
      if (index >= lastRowStartIndex) {
        const lastRowItemCount = children.length - lastRowStartIndex
        if (lastRowItemCount > 0 && lastRowItemCount < itemsPerRow) {
          // 拉宽使其均匀分布填满整行
          finalColSpan = Math.ceil(columns / lastRowItemCount)
        }
      }
    }

    return {
      gridColumn: `span ${finalColSpan} / span ${finalColSpan}`,
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
      minWidth: 0,
    }
  }

  return {
    gridStyle,
    getChildGridStyle,
    gridChildren: computed(() => toValue(options.children)),
  }
}