/**
 * @module @spark-appworks/spark-component:components/containers/support/RendererActions.types
 * @spark-appworks/spark-component 的 components/containers/support/RendererActions.types 模块。
 * 导出 ClassModel symbol: ActionsAlign, ActionsPosition, PermissionDeniedBehavior, RendererActionsProps（共 4 个 symbol）。
 */
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
// 这里不再为 JS 基础类型保留导出别名，固定策略直接内联到属性上。

/** 权限不足时的动作呈现策略。 */
export type PermissionDeniedBehavior = 'hide' | 'disable'

import type { SparkNodeProps } from '../../shared-types.js'

/**
 * 表格行动作列配置属性。
 *
 * 用于 `r-table` 的 `actions` 属性，描述行动作操作列的列元数据与子动作节点。
 */
export type RendererActionsProps = SparkNodeProps & {
  /** 行动作列停靠位置（列在表格的左侧或右侧） */
    position?: ActionsPosition
    /** 操作列单元格文本对齐方式 */
    align?: ActionsAlign
    /** 列固定策略 */
    fixed?: boolean | ActionsPosition
    /** 列标题文本 */
    label?: string
    /** 列宽度 */
    width?: number | string
    /** 列附加 CSS class */
    class?: string}
