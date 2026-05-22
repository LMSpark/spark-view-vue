export type RendererCollapseApi = {
  getExpandedItems(): string | number | Array<string | number> | undefined
  setExpandedItems(value: string | number | Array<string | number>): void
  expandAll(): void
  collapseAll(): void
  toggleItem(name: string | number): void
  isItemExpanded(name: string | number): boolean}
