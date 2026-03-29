/**
 * 字段层 composable 分层入口。
 *
 * 分组约定：
 * - context / permission: 解析字段所在上下文、可见性、可编辑性
 * - options: 解析静态 / DataKey 动态选项
 * - actions: 文件、选择器等字段交互动作
 */



// ── 上下文 / 权限 ───────────────────────────────────────────────────────────
export { useResolvedFieldContext } from './context/index.js'
export {
  useFieldPermission,
} from './context/index.js'
export type {
  FieldPermissionProps,
} from './context/index.js'
export { useFieldContext } from './context/index.js'

// ── 选项 / 值格式化 ─────────────────────────────────────────────────────────
export {
  useFieldOptions,
  useOptionField,
} from './options/index.js'
export type {
  FieldOption,
} from './options/index.js'

// ── 交互动作 ───────────────────────────────────────────────────────────────
export { useFieldActionMode } from './actions/index.js'
export { useFileFieldActions } from './actions/index.js'
export { useSelectorFieldActions } from './actions/index.js'