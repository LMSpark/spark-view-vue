import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import type { RendererEditorProps } from '../../RendererEditor.types'
import type { ToolbarPosition } from '../../layout'
import type { RToolbarProps } from '../../non-data-components/RendererToolbar.types'

interface RendererTreeInputProps {
  dataKey?: string | undefined
  children?: SparkNode['children'] | undefined
  toolbar?: RToolbarProps | undefined
  actions?: RToolbarProps | undefined
  editor?: RendererEditorProps | undefined
}

interface RendererTreeInputOptions {
  props: RendererTreeInputProps
}

export function useRendererTreeInput(options: RendererTreeInputOptions) {
  const effectiveDataKey = computed(() => options.props.dataKey)

  // 优先消费结构化 props.toolbar / props.actions / props.editor。
  const allChildNodes = computed(() => getSparkNodeChildren(options.props.children))
  const STRUCTURAL_CHILD_TYPES = new Set(['r-toolbar', 'r-editor'])
  const contentChildren = computed(() => allChildNodes.value.filter(child => !STRUCTURAL_CHILD_TYPES.has(child.type)))
  const toolbarNode = computed(() => options.props.toolbar)
  const actionsNode = computed(() => options.props.actions)
  const editorNode = computed(() => options.props.editor)

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
    const position = toolbarNode.value?.position
    return position === 'top' || position === 'bottom' || position === 'left' || position === 'right' ? position : 'top'
  })
  const toolbarClassValue = computed<string | undefined>(() => {
    const className = toolbarNode.value?.class
    return typeof className === 'string' ? className : undefined
  })
  const nodeActionClassValue = computed<string>(() => {
    const className = actionsNode.value?.class
    return typeof className === 'string' ? className : ''
  })
  const editorConfigs = computed(() => getSparkNodeChildren(editorNode.value?.children))
  const editorPositionValue = computed<ToolbarPosition>(() => {
    const position = editorNode.value?.position
    return position === 'top' || position === 'bottom' || position === 'left' || position === 'right' ? position : 'right'
  })
  const editorClassValue = computed<string>(() => {
    const className = editorNode.value?.class
    return typeof className === 'string' ? className : ''
  })
  const editorStyleValue = computed<Record<string, string>>(() => {
    const width = editorNode.value?.width
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
