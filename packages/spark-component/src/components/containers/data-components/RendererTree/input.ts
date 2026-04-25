import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import type { ActionsNode } from '../../support/RendererActions.types'
import type { PermissionDeniedBehavior } from '../../support/RendererActions.types'
import type { EditorNode } from '../../RendererEditor.types'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'

interface RendererTreeInputProps {
  dataKey?: string | undefined
  children?: SparkNode['children'] | undefined
  toolbar?: ToolbarNode | undefined
  actions?: ActionsNode | undefined
  editor?: EditorNode | undefined
}

interface RendererTreeInputOptions {
  props: RendererTreeInputProps
}

export function useRendererTreeInput(options: RendererTreeInputOptions) {
  const effectiveDataKey = computed(() => options.props.dataKey)

  // 优先消费结构化 props.toolbar / props.actions / props.editor；
  // 兼容旧配置：若未提升，仍可从 children 中回退提取结构节点。
  const allChildNodes = computed(() => getSparkNodeChildren(options.props.children))
  const STRUCTURAL_CHILD_TYPES = new Set(['r-toolbar', 'r-actions', 'r-editor'])
  const contentChildren = computed(() => allChildNodes.value.filter(child => !STRUCTURAL_CHILD_TYPES.has(child.type)))
  const toolbarNode = computed(() => options.props.toolbar ?? allChildNodes.value.find(child => child.type === 'r-toolbar'))
  const actionsNode = computed(() => options.props.actions ?? allChildNodes.value.find(child => child.type === 'r-actions'))
  const editorNode = computed(() => options.props.editor ?? allChildNodes.value.find(child => child.type === 'r-editor'))

  const nodeContentChildren = computed<SparkNode[]>(() => {
    const nodes: SparkNode[] = []
    for (const child of contentChildren.value) {
      if (typeof child === 'string') continue
      nodes.push(child)
    }
    return nodes
  })
  const dockedNodeActions = computed(() => getSparkNodeChildren(actionsNode.value?.children))
  const hasNodeActions = computed(() => dockedNodeActions.value.length > 0)
  const toolbarConfigs = computed(() => getSparkNodeChildren(toolbarNode.value?.children))
  const toolbarPositionValue = computed<ToolbarPosition>(() => {
    const position = toolbarNode.value?.props?.['position']
    return position === 'top' || position === 'bottom' || position === 'left' || position === 'right' ? position : 'top'
  })
  const toolbarClassValue = computed<string | undefined>(() => {
    const className = toolbarNode.value?.props?.['class']
    return typeof className === 'string' ? className : undefined
  })
  const nodeActionClassValue = computed<string>(() => {
    const className = actionsNode.value?.props?.['class']
    return typeof className === 'string' ? className : ''
  })
  const permissionDeniedBehaviorValue = computed<PermissionDeniedBehavior>(() => {
    const behavior = actionsNode.value?.props?.['permDeniedBehavior']
    return behavior === 'hide' || behavior === 'disable' ? behavior : 'disable'
  })
  const editorConfigs = computed(() => getSparkNodeChildren(editorNode.value?.children))
  const editorPositionValue = computed<ToolbarPosition>(() => {
    const position = editorNode.value?.props?.['position']
    return position === 'top' || position === 'bottom' || position === 'left' || position === 'right' ? position : 'right'
  })
  const editorClassValue = computed<string>(() => {
    const className = editorNode.value?.props?.['class']
    return typeof className === 'string' ? className : ''
  })
  const editorStyleValue = computed<Record<string, string>>(() => {
    const width = editorNode.value?.props?.['width']
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
    nodeContentChildren,
    toolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
    dockedNodeActions,
    nodeActionClassValue,
    permissionDeniedBehaviorValue,
    hasNodeActions,
    editorConfigs,
    editorPositionValue,
    editorClassValue,
    editorStyleValue,
    showEditor,
  }
}
