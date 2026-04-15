import type { SparkNode } from '../../internal'

/** 动作区内容对齐方式。 */
export type ActionsAlign = 'left' | 'center' | 'right'

/** 动作区停靠位置。 */
export type ActionsPosition = 'left' | 'right'

/**
 * 动作区固定策略。
 *
 * - `true`：沿用宿主默认固定行为
 * - `'left' | 'right'`：显式固定到指定侧
 * - `false | undefined`：不额外固定
 */
export type ActionsFixed = boolean | ActionsPosition

/**
 * `r-actions` 结构化配置属性。
 *
 * 由列表、表格、树等容器读取，用于决定动作区的列标题、宽度、停靠和样式。
 */
export interface RendererActionsConfigProps extends Record<string, unknown> {
  /** 动作区停靠位置。 */
  position?: ActionsPosition
  /** 动作区标题。 */
  label?: string
  /** 动作区宽度。 */
  width?: string | number
  /** 动作区内容对齐方式。 */
  align?: ActionsAlign
  /** 动作区固定策略。 */
  fixed?: ActionsFixed
  /** 动作区附加 class。 */
  class?: string
}

/**
 * `r-actions` 结构化节点。
 *
 * 作为 dock 型子节点挂在数据容器下，由绑定层提升为容器的 `actions` 属性。
 */
export interface ActionsNode extends SparkNode {
  /** 节点类型固定为 `r-actions`。 */
  type: 'r-actions'
  /** 动作区结构化配置。 */
  props?: RendererActionsConfigProps
  /** 动作节点列表。 */
  children?: SparkNode[]
}
