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

function hasSpanOverride(child: SparkNode, keys: string[]): boolean {
  return keys.some(key => nodeInputProp(child, key) !== undefined)
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

function normalizeAutoFitSpan(rawSpan: number, totalColumns: number, childCount: number): number {
  const safeColumns = Math.max(1, Math.floor(totalColumns))
  const safeChildCount = Math.max(1, Math.floor(childCount))
  const targetColumns = Math.min(safeChildCount, 4)
  const baseSpan = Math.max(1, Math.floor(safeColumns / targetColumns))

  return Math.max(1, Math.round(rawSpan / baseSpan))
}

function getAutoFitTrackCount(childCount: number): number {
  return Math.max(1, Math.min(Math.floor(childCount), 4))
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
    const children = toValue(options.children)
    const columns = Math.max(toValue(options.columns ?? DEFAULT_GRID_COLUMNS), 1)
    const autoFitMinWidth = toValue(options.autoFitMinWidth ?? '').trim()
    const hasAutoFit = autoFitMinWidth.length > 0
    const spanKeys = ['colSpan', 'gridColSpan', 'span']
    const defaultColSpanValue = toValue(options.defaultColSpan)
    const defaultColSpan = defaultColSpanValue ?? DEFAULT_GRID_COLUMNS
    const rawColSpan = getSpanValue(child, spanKeys, defaultColSpan)
    const hasExplicitColSpan = hasSpanOverride(child, spanKeys) || defaultColSpanValue !== undefined
    const colSpan = hasAutoFit
      ? normalizeAutoFitSpan(rawColSpan, columns, children.length)
      : rawColSpan
    const rowSpan = getSpanValue(child, ['rowSpan', 'gridRowSpan'], 1)

    let finalColSpan = colSpan

    // 当启用自动拉宽且提供了索引时，计算最后一行是否需要拉宽
    if (options.autoFillLastRow && index !== undefined) {
      if (hasAutoFit) {
        const trackCount = getAutoFitTrackCount(children.length)
        const baseSpan = hasExplicitColSpan ? Math.max(1, colSpan) : 1
        const itemsPerRow = Math.max(1, Math.floor(trackCount / baseSpan))
        const remainder = children.length % itemsPerRow
        const lastRowItemCount = remainder === 0 ? itemsPerRow : remainder
        const lastRowStartIndex = children.length - lastRowItemCount

        if (index >= lastRowStartIndex) {
          if (lastRowItemCount === 1) {
            finalColSpan = trackCount
          } else if (lastRowItemCount === 2 && trackCount % 2 === 0) {
            finalColSpan = Math.max(baseSpan, trackCount / 2)
          } else if (!hasExplicitColSpan) {
            finalColSpan = 1
          }
        }
      } else {
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
    }

    const childGridStyle: CSSProperties = {
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
      minWidth: 0,
    }

    if (!hasAutoFit || hasExplicitColSpan || finalColSpan > 1) {
      childGridStyle.gridColumn = `span ${finalColSpan} / span ${finalColSpan}`
    }

    return childGridStyle
  }

  return {
    gridStyle,
    getChildGridStyle,
    gridChildren: computed(() => toValue(options.children)),
  }
}