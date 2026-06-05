import type { DataSet } from '@spark-appworks/spark-data'
import type { ConfigPageNode } from '../page/config-page'
import type { PageNodeRenderConfig } from '../page/config-page'
import type { ProjectDesign } from './design'

/** 项目运行投影聚合（框架无关）。 */
export class ProjectRuntime {
  constructor(private readonly design: ProjectDesign) {}

  /** 已打开的配置页 class 实例。 */
  get pages(): Iterable<ConfigPageNode> {
    return this.design.pages
  }

  /** 已完成四文件加载、可生成渲染快照的页面。 */
  listLoadedPages(): ConfigPageNode[] {
    return [...this.design.pages].filter(page => page.runtime.isLoaded)
  }

  /** 批量生成已加载页的渲染配置（用于预览/运行管线）。 */
  collectRenderConfigs(): PageNodeRenderConfig[] {
    return this.listLoadedPages().map(page => page.runtime.toRenderConfig())
  }

  /** 按 pageId 查找已打开的配置页（不要求已加载四文件）。 */
  findOpenPage(pageId: string): ConfigPageNode | null {
    return this.design.findConfigPageByPageId(pageId)
  }

  /** 按 pageId 查找已加载页的运行投影。 */
  findLoadedPage(pageId: string): ConfigPageNode | null {
    const normalized = pageId.trim()
    if (!normalized) return null
    return this.listLoadedPages().find(page => page.pageId === normalized) ?? null
  }

  /** 已加载页的渲染配置；未加载返回 null。 */
  findRenderConfig(pageId: string): PageNodeRenderConfig | null {
    const page = this.findLoadedPage(pageId)
    return page ? page.runtime.toRenderConfig() : null
  }

  /** 打开页与已加载页数量摘要。 */
  readPageRuntimeStats(): { openCount: number; loadedCount: number } {
    const openPages = [...this.design.pages]
    const loadedCount = openPages.filter(page => page.runtime.isLoaded).length
    return { openCount: openPages.length, loadedCount }
  }

  /** 已加载配置页的 DataSet 运行投影；未加载返回 null。 */
  findOpenDataSet(pageId: string): DataSet | null {
    const page = this.findLoadedPage(pageId)
    if (!page) return null
    return page.dataSet.value
  }
}
