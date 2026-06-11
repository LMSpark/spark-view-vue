/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererTabs/types
 * RendererTabs 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RendererTabsApi（共 1 个 symbol）。
 */
/** Renderer Tabs Api 的语义模型。 */
export type RendererTabsApi = {
  getActiveTab(): string | number | undefined
  setActiveTab(name: string | number): void
  getPaneNames(): Array<string | number>
  getPaneCount(): number}
