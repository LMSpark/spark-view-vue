import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import type { ActionsNode } from '../../support/RendererActionHost.types'
import type { EditorNode } from '../../RendererEditor.types'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'

interface RendererTreeInputProps {
  dataKey?: string | undefined
  children?: SparkNode[] | undefined
  toolbar?: ToolbarNode | undefined
  actions?: ActionsNode | undefined
  editor?: EditorNode | undefined
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

  // 子节点类型已由绑定层从 children 提升为 props（toolbar / actions / editor），
  // 此处 children 仅包含内容子节点。
  const contentChildren = computed(() => options.props.children ?? [])

  const nodeContentChildren = computed<SparkNode[]>(() => {
    const nodes: SparkNode[] = []
    for (const child of contentChildren.value) {
      if (typeof child === 'string') continue
      nodes.push(child)
    }
    return nodes
  })
  const dockedNodeActions = computed(() => getSparkNodeChildren(options.props.actions?.children))

  const hasLegacyNodeActions = computed(() =>
    dockedNodeActions.value.length === 0 && (effectiveAllowAppend.value || effectiveAllowDelete.value)
  )

  const hasNodeActions = computed(() => dockedNodeActions.value.length > 0 || hasLegacyNodeActions.value)
  const editorConfigs = computed(() => getSparkNodeChildren(options.props.editor?.children))
  const editorPositionValue = computed<ToolbarPosition>(() => options.props.editor?.props?.position ?? 'right')
  const editorClassValue = computed(() => options.props.editor?.props?.class ?? '')
  const editorStyleValue = computed<Record<string, string>>(() => {
    const width = options.props.editor?.props?.width
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
    hasLegacyNodeActions,
    hasNodeActions,
    editorConfigs,
    editorPositionValue,
    editorClassValue,
    editorStyleValue,
    showEditor,
  }
}
