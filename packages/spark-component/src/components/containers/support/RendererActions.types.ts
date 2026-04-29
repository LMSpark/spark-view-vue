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

/** 权限不足时的动作呈现策略。 */
export type PermissionDeniedBehavior = 'hide' | 'disable'
