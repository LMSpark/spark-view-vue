/**
 * LoadedPageNode — 运行时页面适配：领域 ConfigPageNode + PageContentRepository。
 * 实现 PageNodeLike，供 spark-component 渲染管线加载四文件。
 */
import type { PageContentRepository } from '../io/page-content-repository'
import type {
  ConfigPageNode,
  PageNodeLike,
  PageNodeLoadOptions,
  PageNodeRenderConfig,
} from '../model/page/config-page'

export class LoadedPageNode implements PageNodeLike {
  constructor(
    readonly node: ConfigPageNode,
    private readonly repository: PageContentRepository,
  ) {}

  get pageId(): string {
    return this.node.pageId
  }

  get isLoaded(): boolean {
    return this.node.isLoaded
  }

  async load(options?: PageNodeLoadOptions): Promise<void> {
    await this.repository.loadPage(this.node, options)
  }

  toRenderConfig(): PageNodeRenderConfig {
    return this.node.toRenderConfig()
  }
}
