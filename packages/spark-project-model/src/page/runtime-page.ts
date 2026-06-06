/**
 * 运行态配置页：ConfigPageNode + PageContentLoader 绑定。
 */
import type { ProjectNodeData } from '../navigation/project-node'
import {
  ConfigPageNode,
  type PageNodeLike,
  type PageNodeLoadOptions,
} from '../page/config-page'
import {
  PAGE_NODE_FILE_NAMES,
  type PageNodeFileName,
} from '../page/page-file'
import type { PageContentLoader } from '../io/page-content-loader'

async function loadRuntimePageFile(
  page: ConfigPageNode,
  loader: PageContentLoader,
  name: PageNodeFileName,
  options: PageNodeLoadOptions = {},
): Promise<void> {
  const result = await loader.loadPageFileContent(page.pageId, name, {
    forceReload: options.forceReload === true,
  })
  if (!result.success) {
    throw new Error(result.error ?? result.reason ?? `${name} 加载失败`)
  }
  page.hydrateFileText(name, result.data ?? '')
}

async function loadRuntimePageFiles(
  page: ConfigPageNode,
  loader: PageContentLoader,
  options: PageNodeLoadOptions = {},
): Promise<void> {
  const forceReload = options.forceReload === true
  if (page.isLoaded && !forceReload) return
  await Promise.all(
    PAGE_NODE_FILE_NAMES.map(name => loadRuntimePageFile(page, loader, name, { forceReload })),
  )
  page.markLoaded()
}

export function createRuntimePageNode(
  pageId: string,
  loader: PageContentLoader,
  node?: ProjectNodeData,
): PageNodeLike {
  const normalized = pageId.trim()
  if (!normalized) {
    throw new Error('pageId 不能为空')
  }
  const navNode: ProjectNodeData = node ?? {
    id: normalized,
    title: normalized,
    nodeKind: 'page',
    path: `/${normalized}`,
    icon: 'Document',
  }
  const page = new ConfigPageNode({
    node: navNode,
    pid: '',
    pageId: normalized,
  })
  return {
    get pageId() { return page.pageId },
    get isLoaded() { return page.isLoaded },
    load: (options?: PageNodeLoadOptions) => loadRuntimePageFiles(page, loader, options),
    toRenderConfig: () => page.toRenderConfig(),
  }
}
