export interface RendererDrawerApi {
  open(): void
  close(): void
  isVisible(): boolean
  toggle(): void
}
