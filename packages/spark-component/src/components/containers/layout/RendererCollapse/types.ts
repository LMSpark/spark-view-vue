/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererCollapse/types
 * RendererCollapse 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RendererCollapseApi（共 1 个 symbol）。
 */
/** Renderer Collapse Api 的语义模型。 */
export type RendererCollapseApi = {
  getExpandedItems(): string | number | Array<string | number> | undefined
  setExpandedItems(value: string | number | Array<string | number>): void
  expandAll(): void
  collapseAll(): void
  toggleItem(name: string | number): void
  isItemExpanded(name: string | number): boolean}
