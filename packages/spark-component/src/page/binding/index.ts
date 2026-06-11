/**
 * @module @spark-appworks/spark-component:page/binding/index
 * @spark-appworks/spark-component 的 page/binding/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  normalizeRuleEvents,
  normalizeOnProps,
} from './bind-normalize.js'

export { buildPageChildren } from './build-page-children.js'

export type {
  BuildPageChildrenOptions,
  PageScriptCaller,
} from './build-page-children.js'