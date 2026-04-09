import { computed } from 'vue'
import type { SparkNode } from '../../../internal'
import { useDockExtraction, TREE_DOCK_TYPES, type DockProp, type DockToolbarNode, type DockActionsNode, type DockEditorNode } from '../../docks/dock-extraction'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'

interface RendererTreeInputProps {
  dataKey?: string | undefined
  children?: SparkNode[] | undefined
  toolbar?: DockProp<DockToolbarNode> | undefined
  actions?: DockProp<DockActionsNode> | undefined
  editor?: DockProp<DockEditorNode> | undefined
  allowAppend?: boolean | undefined
  allowDelete?: boolean | undefined
}

interface RendererTreeInputOptions {
  props: RendererTreeInputProps
}

export function useRendererTreeInput(options: RendererTreeInputOptions) {
  const effectiveDataKey = computed(() => options.props.dataKey)

  const effectiveAllowAppend = computed(() => options.props.allowAppend ?? false)
  const effectiveAllowDelete = computed(() => options.props.allowDelete ?? false)

  const { contentChildren, getDockChildren, getDockProp } = useDockExtraction(
    computed(() => options.props.children),
    TREE_DOCK_TYPES,
    { propSource: computed(() => options.props) },
  )

  const nodeContentChildren = computed<SparkNode[]>(() => {
    const nodes: SparkNode[] = []
    for (const child of contentChildren.value) {
      if (typeof child === 'string' || typeof child === 'number') continue
      nodes.push(child)
    }
    return nodes
  })
  const dockedToolbar = computed(() => getDockChildren('r-toolbar'))
  const dockedNodeActions = computed(() => getDockChildren('r-actions'))
  const dockedEditor = computed(() => getDockChildren('r-editor'))

  const hasLegacyNodeActions = computed(() =>
    dockedNodeActions.value.length === 0 && (effectiveAllowAppend.value || effectiveAllowDelete.value)
  )

  const hasNodeActions = computed(() => dockedNodeActions.value.length > 0 || hasLegacyNodeActions.value)
  const editorConfigs = computed(() => dockedEditor.value)
  const editorPositionValue = computed<ToolbarPosition>(() => getDockProp<ToolbarPosition>('r-editor', 'position') ?? 'right')
  const editorClassValue = computed(() => getDockProp<string>('r-editor', 'class') ?? '')
  const editorStyleValue = computed<Record<string, string>>(() => {
    const width = getDockProp<string | number>('r-editor', 'width')
    if (typeof width === 'number' && Number.isFinite(width)) {
      return {
        width: `${width}px`,
        flexBasis: `${width}px`,
      }
    }
    if (typeof width === 'string' && width.trim().length > 0) {
      return {
        width,
        flexBasis: width,
      }
    }
    return {}
  })

  const showEditor = computed(() => editorConfigs.value.length > 0)

  return {
    effectiveDataKey,
    effectiveAllowAppend,
    effectiveAllowDelete,
    nodeContentChildren,
    dockedToolbar,
    dockedNodeActions,
    hasLegacyNodeActions,
    hasNodeActions,
    editorConfigs,
    editorPositionValue,
    editorClassValue,
    editorStyleValue,
    showEditor,
    getDockProp,
  }
}