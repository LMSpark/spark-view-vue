/**
 * 容器层 composable 分层入口。
 *
 * 目标：
 * 1. 给 `components/containers` 下的 `use*` 提供统一发现入口
 * 2. 按职责分组，避免继续从目录平铺文件名猜用途
 * 3. 不改变现有深路径导入，先补清晰的层级结构
 */

export * as containerActionComposables from './actions/index.js'
export * as containerContextComposables from './context/index.js'
export * as containerDataComposables from './data/index.js'
export * as containerLayoutComposables from './layout/index.js'
export * as containerDataComponentComposables from './data-components/composables/index.js'
export * as containerNonDataComponentComposables from './non-data-components/composables/index.js'
export * as containerDataComponentSupport from './data-components/support/index.js'
export * as containerDataUiComposables from './data-components/composables/index.js'
export * as containerNonDataUiComposables from './non-data-components/composables/index.js'

// ── 数据源 / 上下文编排 ─────────────────────────────────────────────────────
export {
  useContainerDataSource,
  useContainerDataSourceEffects,
} from './data/index.js'
export { useContainerContextData } from './context/index.js'
export { useDataScope } from './context/index.js'
export { useFormDetailContainer } from './context/index.js'
export { useModuleContext } from './context/index.js'

// ── 布局 / 插槽 / 过滤区 ───────────────────────────────────────────────────
export {
  useContainerGrid,
  normalizeGridGap,
  normalizeSpan,
} from './layout/index.js'
export { useCompositeItemGrid } from './layout/index.js'
export { useContainerSlots } from './layout/index.js'
export { useContainerToolbar } from './layout/index.js'
export { useTableFilters } from './layout/index.js'

// ── 事件控制 / 默认行为分发 ───────────────────────────────────────────────
export {
  useEventDefaults,
  runControlledInteraction,
  createInteractionControl,
  createCancelledCrudResult,
} from './support/index.js'
export type {
  InteractionControl,
  CancelableHandler,
  EventDefaultDeclaration,
  EventDispatcher,
} from './support/index.js'

// ── 动作区 ──────────────────────────────────────────────────────────────────
export {
  useContainerActions,
} from './actions/index.js'
export type {
  LateralActionPosition,
} from './actions/index.js'