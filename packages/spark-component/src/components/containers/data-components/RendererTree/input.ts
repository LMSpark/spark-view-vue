import { computed } from 'vue'
import { getSparkNodeChildren, type SparkNode } from '../../../internal'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'

interface RendererTreeInputProps {
  dataKey?: string | undefined
  children?: SparkNode[] | undefined
  toolbar?: SparkNode | undefined
  actions?: SparkNode | undefined
  editor?: SparkNode | undefined
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

  // Dock 节点已由绑定层从 children 提升为 props（toolbar / actions / editor），
  // 此处 children 仅包含内容子节点。
  const contentChildren = computed(() => options.props.children ?? [])

  const nodeContentChildren = computed<SparkNode[]>(() => {
    const nodes: SparkNode[] = []
    for (const child of contentChildren.value) {
      if (typeof child === 'string' || typeof child === 'number') continue
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
  const editorPositionValue = computed<ToolbarPosition>(() => (options.props.editor?.props?.['position'] as ToolbarPosition | undefined) ?? 'right')
  const editorClassValue = computed(() => (options.props.editor?.props?.['class'] as string | undefined) ?? '')
  const editorStyleValue = computed<Record<string, string>>(() => {
    const width = options.props.editor?.props?.['width'] as string | number | undefined
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