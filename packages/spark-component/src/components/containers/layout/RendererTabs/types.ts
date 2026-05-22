export type RendererTabsApi = {
  getActiveTab(): string | number | undefined
  setActiveTab(name: string | number): void
  getPaneNames(): Array<string | number>
  getPaneCount(): number}
