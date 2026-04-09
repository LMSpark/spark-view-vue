import { computed } from 'vue'
import { getSparkNodeChildren, nodeInputProp, type SparkNode } from '../../../internal'
import { useDockExtraction, TABLE_DOCK_TYPES, type DockProp, type DockToolbarNode, type DockFilterNode, type DockActionsNode } from '../../docks/dock-extraction'
import type { LateralActionPosition } from '../../actions/useContainerActions'

interface RendererTableInputProps {
  dataKey?: string | undefined
  children?: SparkNode[] | undefined
  toolbar?: DockProp<DockToolbarNode> | undefined
  filter?: DockProp<DockFilterNode> | undefined
  actions?: DockProp<DockActionsNode> | undefined
}

interface RendererTableInputOptions {
  props: RendererTableInputProps
  attrs: Readonly<Record<string, unknown>>
}

export function useRendererTableInput(options: RendererTableInputOptions) {
  function readStringAttr(name: string): string | undefined {
    const value = options.attrs[name]
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  function readBooleanAttr(name: string): boolean | undefined {
    const value = options.attrs[name]
    if (typeof value === 'boolean') return value
    if (value === '') return true
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
  }

  function readNumberAttr(name: string): number | undefined {
    const value = options.attrs[name]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    return undefined
  }

  function readNumberOrStringAttr(name: string): number | string | undefined {
    const value = options.attrs[name]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.length > 0) return value
    return undefined
  }

  const baseTableAttrs = computed<Record<string, unknown>>(() => {
    return { ...options.attrs }
  })

  const effectiveDataKey = computed(() => options.props.dataKey)

  const legacyRowActionsValue = computed<SparkNode[]>(() => {
    const value = options.attrs['rowActions']
    return Array.isArray(value) ? value as SparkNode[] : []
  })

  const legacyRowActionsPositionValue = computed<LateralActionPosition | undefined>(() => {
    const value = readStringAttr('rowActionsPosition')
    return value === 'left' || value === 'right' ? value : undefined
  })

  const legacyRowActionsAlignValue = computed<'left' | 'center' | 'right' | undefined>(() => {
    const value = readStringAttr('rowActionsAlign')
    return value === 'left' || value === 'center' || value === 'right' ? value : undefined
  })

  const legacyRowActionsFixedValue = computed<boolean | 'left' | 'right' | undefined>(() => {
    const value = options.attrs['rowActionsFixed']
    if (typeof value === 'boolean') return value
    if (value === 'left' || value === 'right') return value
    return undefined
  })

  const { contentChildren, getDockChildren, getDockProp } = useDockExtraction(
    computed(() => options.props.children),
    TABLE_DOCK_TYPES,
    { propSource: computed(() => options.props) },
  )

  const dockedToolbar = computed(() => getDockChildren('r-toolbar'))
  const dockedFilters = computed(() => getDockChildren('r-filter'))
  const dockedRowActions = computed(() => getDockChildren('r-actions'))

  const sparkChildren = computed<SparkNode[]>(() => {
    const nodes: SparkNode[] = []
    for (const child of contentChildren.value) {
      if (typeof child === 'string' || typeof child === 'number') continue
      if (isCollectedTableColumn(child)) nodes.push(child)
    }
    return nodes
  })

  function assertNoLegacyTableStructures(): void {
    const toolbarValue = options.props.toolbar ?? options.attrs['toolbar']
    if (Array.isArray(toolbarValue) && toolbarValue.length > 0) {
      throw new Error('[RendererTable] props.toolbar 已废除旧数组格式。请使用 dock 子节点 { type: "r-toolbar", children: [...] } 格式。')
    }

    if (Array.isArray(options.attrs['filterColumns']) && options.attrs['filterColumns'].length > 0) {
      throw new Error('[RendererTable] props.filterColumns 已废除。请使用 dock 子节点 { type: "r-filter", children: [...] } 格式。')
    }

    if (legacyRowActionsValue.value.length > 0) {
      throw new Error('[RendererTable] props.rowActions 已废除。请使用 dock 子节点 { type: "r-actions", children: [...] } 格式。')
    }
  }

  return {
    baseTableAttrs,
    effectiveDataKey,
    contentChildren,
    dockedToolbar,
    dockedFilters,
    dockedRowActions,
    sparkChildren,
    getDockProp,
    legacyRowActionsPositionValue,
    legacyRowActionsAlignValue,
    legacyRowActionsFixedValue,
    readStringAttr,
    readBooleanAttr,
    readNumberAttr,
    readNumberOrStringAttr,
    assertNoLegacyTableStructures,
  }
}

function isCollectedTableColumn(config: SparkNode): boolean {
  const type = config.type
  if (typeof type !== 'string' || type.length === 0) return false
  if (/^Render[A-Z]/.test(type)) return false
  if (type === 'el-table-column') return true
  if (!type.startsWith('r-')) return false
  const field = nodeInputProp(config, 'field')
  if (typeof field === 'string' && field.length > 0) {
    return true
  }
  const children = getSparkNodeChildren(config.children)
  if (children.length > 0) return true
  return false
}