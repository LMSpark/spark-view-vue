import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import type { REditorProps } from '../../zones/RendererEditor.types'
import type { RToolbarProps } from '../../layout/RendererToolbar.types'
import { useContainerToolbar } from '../../runtime/container-ui'

interface RendererTreeInputProps {
  dataKey?: string | undefined
  children?: SparkNode['children'] | undefined
  toolbar?: RToolbarProps | undefined
  actions?: RToolbarProps | undefined
  editor?: REditorProps | undefined
}

interface RendererTreeInputOptions {
  props: RendererTreeInputProps
}

export function useRendererTreeInput(options: RendererTreeInputOptions) {
  // 优先消费结构化 props.toolbar / props.actions / props.editor；children 不再做结构分流。
  const toolbarNode = computed(() => options.props.toolbar)
  const actionsNode = computed(() => options.props.actions)
  const editorNode = computed(() => options.props.editor)

  const nodeContentChildren = computed<SparkNode[]>(() => {
    return getSparkNodeChildren(options.props.children)
  })
  const nodeActionConfigs = computed(() => getSparkNodeChildren(actionsNode.value?.children))
  const hasNodeActions = computed(() => nodeActionConfigs.value.length > 0)
  const {
    visibleToolbarConfigs: toolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
  } = useContainerToolbar({
    toolbarNode,
    defaultClass: '',
  })
  const nodeActionClassValue = computed<string>(() => {
    const className = actionsNode.value?.class
    return typeof className === 'string' ? className : ''
  })
  const {
    visibleToolbarConfigs: editorConfigs,
    toolbarPositionValue: editorPositionValue,
    toolbarClassValue: editorClassValue,
  } = useContainerToolbar({ toolbarNode: editorNode, defaultPosition: 'right', defaultClass: '' })
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
    nodeContentChildren,
    toolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
    nodeActionConfigs,
    nodeActionClassValue,
    hasNodeActions,
    editorConfigs,
    editorPositionValue,
    editorClassValue,
    editorStyleValue,
    showEditor,
  }
}
