import { computed } from 'vue'
import { DEFAULT_DOCK, getDockedChildren, getSparkNodeChildren, nodeDock, nodeInputProp, type SparkNode } from '../../../internal'
import type { LateralActionPosition } from '../../actions/useContainerActions'

interface RendererTableInputProps {
  dataKey?: string | undefined
  children?: SparkNode[] | undefined
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
    const { toolbar: _legacyToolbar, ...rest } = options.attrs
    return rest
  })

  const effectiveDataKey = computed(() => options.props.dataKey)

  const configChildren = computed<SparkNode[]>(() => {
    const children = options.props.children
    return Array.isArray(children) && children.length > 0 ? children : []
  })

  const legacyFilterColumnsValue = computed<string[]>(() => {
    const value = options.attrs['filterColumns']
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  })

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

  const dockedToolbar = computed(() => getDockedChildren(configChildren.value, 'toolbar'))
  const dockedFilters = computed(() => getDockedChildren(configChildren.value, 'filter'))
  const dockedRowActions = computed(() => getDockedChildren(configChildren.value, 'actions'))

  const sparkChildren = computed(() => {
    return configChildren.value.filter(child => nodeDock(child) === DEFAULT_DOCK && isCollectedTableColumn(child))
  })

  function assertNoLegacyTableStructures(): void {
    if (Array.isArray(options.attrs['toolbar']) && options.attrs['toolbar'].length > 0) {
      throw new Error('[RendererTable] props.toolbar 已废除。请将工具栏节点移动到 children，并声明 dock: "toolbar"；位置与样式请改为 props.docks.toolbar。')
    }

    if (legacyFilterColumnsValue.value.length > 0) {
      throw new Error('[RendererTable] props.filterColumns 已废除。请将筛选项移动到 children，并为每个筛选节点声明 dock: "filter"。')
    }

    if (legacyRowActionsValue.value.length > 0) {
      throw new Error('[RendererTable] props.rowActions 已废除。请将行操作节点移动到 children，并声明 dock: "actions"。')
    }

    const legacyDefaultChildren = configChildren.value.filter(child =>
      nodeDock(child) === DEFAULT_DOCK && !isCollectedTableColumn(child)
    )

    if (legacyDefaultChildren.length > 0) {
      const childTypes = legacyDefaultChildren.map(child => child.type).join(', ')
      throw new Error(`[RendererTable] r-table 默认区仅允许列节点。检测到未声明 dock 的非列表达式节点: ${childTypes}。请将工具栏/筛选/行操作节点分别移动到 dock: "toolbar" | "filter" | "actions"。`)
    }
  }

  return {
    baseTableAttrs,
    effectiveDataKey,
    configChildren,
    dockedToolbar,
    dockedFilters,
    dockedRowActions,
    sparkChildren,
    legacyFilterColumnsValue,
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