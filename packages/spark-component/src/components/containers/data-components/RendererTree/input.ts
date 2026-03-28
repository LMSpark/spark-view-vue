import { computed } from 'vue'
import { getDockedChildren, type SparkNode } from '../../../internal'
import type { ContainerDocks } from '../../../../core/types'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'

interface RendererTreeInputProps {
  dataKey?: string | undefined
  children?: SparkNode[] | undefined
  docks?: ContainerDocks | undefined
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

  const nodeContentChildren = computed<SparkNode[]>(() => getDockedChildren(options.props.children))
  const dockedToolbar = computed(() => getDockedChildren(options.props.children, 'toolbar'))
  const dockedNodeActions = computed(() => getDockedChildren(options.props.children, 'actions'))
  const dockedEditor = computed(() => getDockedChildren(options.props.children, 'editor'))

  const editorDock = computed<({ position?: ToolbarPosition } & { class?: string; width?: string | number }) | undefined>(() => {
    const dock = options.props.docks?.['editor']
    return dock as (({ position?: ToolbarPosition } & { class?: string; width?: string | number }) | undefined)
  })

  const hasLegacyNodeActions = computed(() =>
    dockedNodeActions.value.length === 0 && (effectiveAllowAppend.value || effectiveAllowDelete.value)
  )

  const hasNodeActions = computed(() => dockedNodeActions.value.length > 0 || hasLegacyNodeActions.value)
  const editorConfigs = computed(() => dockedEditor.value)
  const editorPositionValue = computed<ToolbarPosition>(() => editorDock.value?.position ?? 'right')
  const editorClassValue = computed(() => editorDock.value?.class ?? '')
  const editorStyleValue = computed<Record<string, string>>(() => {
    const width = editorDock.value?.width
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
  }
}