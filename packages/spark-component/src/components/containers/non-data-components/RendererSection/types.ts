export interface RendererSectionApi {
  isCollapsed(): boolean
  setCollapsed(value: boolean): void
  toggle(): void
}
