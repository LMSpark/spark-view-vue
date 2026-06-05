import type { PageNodeRenderConfig } from './config-page'

type PageRuntimeHost = {
  readonly isLoaded: boolean
  toRenderConfig(): PageNodeRenderConfig
}

/** 配置页运行投影（加载态、渲染快照）。 */
export class PageRuntime {
  constructor(private readonly host: PageRuntimeHost) {}

  get isLoaded(): boolean {
    return this.host.isLoaded
  }

  toRenderConfig(): PageNodeRenderConfig {
    return this.host.toRenderConfig()
  }
}
