/**
 * useContainerToolbar — 容器工具栏的统一配置投影层。
 *
 * 从 toolbar SparkNode 投影出模板消费所需的所有 computed，
 * 避免在 RendererList、RendererForm、RendererDetail 等容器中重复声明相同的三联体。
 */
import { computed } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import { getSparkNodeChildren } from '../../internal'
import type { SparkNode } from '../../internal'
import type { ToolbarPosition } from '../layout'

/** 工具栏节点所需的最小属性形状，与 RToolbarProps 结构对齐。 */
interface ToolbarLike {
  children?: Array<SparkNode | string>
  position?: string
  class?: string | string[]
}

interface UseContainerToolbarOptions {
  /** toolbar SparkNode（响应式 getter 或 ref） */
  toolbarNode: MaybeRefOrGetter<ToolbarLike | null | undefined>
  /**
   * class 回退值，当 toolbar.class 未设置时使用。
   * - Form/Detail/List 默认为 `'renderer-toolbar-default'`
   * - Tree 等自定义样式容器可传 `''` 或 `undefined`
   * @default 'renderer-toolbar-default'
   */
  defaultClass?: string
}

export interface ContainerToolbarState {
  /** toolbar 下的有效子节点列表 */
  visibleToolbarConfigs: ComputedRef<SparkNode[]>
  /** toolbar 位置，默认 'top' */
  toolbarPositionValue: ComputedRef<ToolbarPosition>
  /** toolbar 样式类，默认 'renderer-toolbar-default' */
  toolbarClassValue: ComputedRef<string>
  /** 是否展示工具栏（至少有一个子节点） */
  showToolbar: ComputedRef<boolean>
}

export function useContainerToolbar(options: UseContainerToolbarOptions): ContainerToolbarState {
  const fallbackClass = options.defaultClass ?? 'renderer-toolbar-default'

  const visibleToolbarConfigs = computed(() =>
    getSparkNodeChildren(toValue(options.toolbarNode)?.children)
  )

  const toolbarPositionValue = computed<ToolbarPosition>(() => {
    const position = toValue(options.toolbarNode)?.position
    return position === 'top' || position === 'bottom' || position === 'left' || position === 'right'
      ? position
      : 'top'
  })

  const toolbarClassValue = computed(() => {
    const className = toValue(options.toolbarNode)?.class
    return typeof className === 'string' ? className : fallbackClass
  })

  const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

  return {
    visibleToolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
    showToolbar,
  }
}
