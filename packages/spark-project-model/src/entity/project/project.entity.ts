/**
 * ProjectModel — 软件项目模型。
 *
 * 后端 DB 的 NAVIGATION_NODE_FLAT 是项目节点真源；前端模型同样采用平铺节点集合。
 * 模块、配置页、Vue 页面、动作、外链、引用都先落到节点子类；配置页节点直接拥有
 * rule / dataSet / script / style 子模型，不再经过独立 PageNode 中间层。
 */

import type { NavigationEditSession } from '../../service/navigation/editing.service'
import type { NavigationConfigClient } from '../../service/navigation/client.service'
import type { BasePageContentLoader } from '../../service/content-loader/types'
import type { PageNodeFileApi } from '../../service/file/file-api.service'
import type { PageNodeFileCache } from '../../service/file/file-cache.service'
import { ProjectNodeCollection } from './node-collection.entity'

export type ProjectModelOptions = {
  projectId: string
  fileApi: PageNodeFileApi
  fileCache: PageNodeFileCache
  contentLoaderFactory: () => BasePageContentLoader
  navClient?: NavigationConfigClient | undefined
  navigationSession?: NavigationEditSession
}

export class ProjectModel {
  readonly projectId: string
  readonly nodes: ProjectNodeCollection

  constructor(options: ProjectModelOptions) {
    const projectId = options.projectId.trim()
    if (!projectId) {
      throw new Error('projectId 不能为空')
    }
    this.projectId = projectId
    this.nodes = new ProjectNodeCollection({
      projectId,
      fileApi: options.fileApi,
      fileCache: options.fileCache,
      contentLoaderFactory: options.contentLoaderFactory,
      ...(options.navClient === undefined ? {} : { navClient: options.navClient }),
      ...(options.navigationSession === undefined ? {} : { navigationSession: options.navigationSession }),
    })
  }
}

export type ProjectModelLike = Pick<ProjectModel, 'projectId' | 'nodes'>
