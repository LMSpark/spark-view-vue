import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import type { EditorNode } from '../../RendererEditor.types'
import type { ToolbarPosition } from '../../layout/toolbar-position'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'

interface RendererTreeInputProps {
  dataKey?: string | undefined
  children?: SparkNode['children'] | undefined
  toolbar?: ToolbarNode | undefined
  actions?: ToolbarNode | undefined
  editor?: EditorNode | undefined
}

interface RendererTreeInputOptions {
  props: RendererTreeInputProps
}

export function useRendererTreeInput(options: RendererTreeInputOptions) {
  const effectiveDataKey = computed(() => options.props.dataKey)

  // 优先消费结构化 props.toolbar / props.actions / props.editor；
  // children 模式下约定：第一个 r-toolbar 为工具栏，第二个 r-toolbar 为节点动作。
  const allChildNodes = computed(() => getSparkNodeChildren(options.props.children))
  const STRUCTURAL_CHILD_TYPES = new Set(['r-toolbar', 'r-editor'])
  const contentChildren = computed(() => allChildNodes.value.filter(child => !STRUCTURAL_CHILD_TYPES.has(child.type)))
  const toolbarNodes = computed(() => allChildNodes.value.filter(child => child.type === 'r-toolbar'))
  const toolbarNode = computed(() => options.props.toolbar ?? toolbarNodes.value[0])
  const actionsNode = computed(() => options.props.actions ?? toolbarNodes.value[1])
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
    hasNodeActions,
    editorConfigs,
    editorPositionValue,
    editorClassValue,
    editorStyleValue,
    showEditor,
  }
}
