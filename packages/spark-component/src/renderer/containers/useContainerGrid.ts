import { computed } from 'vue'
import type { CSSProperties, Ref } from 'vue'
import type { ComponentConfig } from '../_pkg'

// ── 默认值 ────────────────────────────────────────────────────────────────────

const DEFAULT_GRID_COLUMNS = 24
const DEFAULT_GRID_GAP = '0px'
const DEFAULT_AUTO_ROWS = 'minmax(32px, auto)'

// ── 规范化辅助函数 ───────────────────────────────────────────────────────────

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

// ── 跨列跨行辅助函数 ─────────────────────────────────────────────────────────

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
  autoFitMinWidth?: Ref<string>
  defaultColSpan?: Ref<number>
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerGrid(options: UseContainerGridOptions) {
  // 默认 ref 让使用 24 列默认网格的容器调用更简洁。
  const columns = options.columns ?? computed(() => DEFAULT_GRID_COLUMNS)
  const gap = options.gap ?? computed(() => DEFAULT_GRID_GAP)
  const autoRows = options.autoRows ?? computed(() => DEFAULT_AUTO_ROWS)
  const autoFitMinWidth = options.autoFitMinWidth ?? computed(() => '')
  const defaultColSpan = options.defaultColSpan ?? computed(() => DEFAULT_GRID_COLUMNS)

  // 容器内容区共用的 grid 布局样式。
  const gridStyle = computed<CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: autoFitMinWidth.value.trim().length > 0
      ? `repeat(auto-fit, minmax(${autoFitMinWidth.value}, 1fr))`
      : `repeat(${Math.max(columns.value, 1)}, minmax(0, 1fr))`,
    gap: normalizeGridGap(gap.value),
    gridAutoRows: autoRows.value || DEFAULT_AUTO_ROWS,
    alignItems: 'start',
  }))

  // 子项可通过布局 props 覆盖默认的跨列 / 跨行占位。
  function getChildGridStyle(child: ComponentConfig): CSSProperties {
    const colSpan = getSpanValue(child, ['colSpan', 'gridColSpan', 'span'], defaultColSpan.value)
    const rowSpan = getSpanValue(child, ['rowSpan', 'gridRowSpan'], 1)

    return {
      gridColumn: `span ${colSpan} / span ${colSpan}`,
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
      minWidth: 0,
    }
  }

  // 提供给 section / form / detail 等块状容器的公开能力。
  return {
    gridStyle,
    getChildGridStyle,
    gridChildren: options.children,
  }
}