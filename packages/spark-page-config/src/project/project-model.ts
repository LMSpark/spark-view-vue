/**
 * ProjectModel — 软件项目模型。
 *
 * 后端 DB 的 NAVIGATION_NODE_FLAT 是项目节点真源；前端模型同样采用平铺节点集合。
 * 模块、配置页、Vue 页面、动作、外链、引用都先落到节点子类；配置页节点直接拥有
 * rule / dataSet / script / style 子模型，不再经过独立 PageNode 中间层。
 */

import type { NavigationEditSession } from '../page-model/navigation/nav-editing'
import type { NavigationConfigClient } from '../page-model/navigation/nav-client'
import type { BasePageContentLoader } from '../page-model/read/page-content-types'
import type { PageNodeFileApi } from '../page-model/model/page-file-api'
import type { PageNodeFileCache } from '../page-model/model/page-file-cache'
import { ProjectNodeCollection } from './project-node-collection'
import { ProjectPlanningModel } from './project-planning-model'

export type ProjectModelOptions = {
  projectId: string
  fileApi: PageNodeFileApi
  fileCache: PageNodeFileCache
  contentLoaderFactory: () => BasePageContentLoader
  navClient?: NavigationConfigClient | undefined
  navigationSession?: NavigationEditSession
  projectRequirement?: string
}

export class ProjectModel {
  readonly projectId: string
  readonly nodes: ProjectNodeCollection
  readonly planning: ProjectPlanningModel

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
      ...(options.projectRequirement === undefined ? {} : { projectRequirement: options.projectRequirement }),
    })
    const planningOptions = {
      projectId,
      nodes: this.nodes,
      ...(options.projectRequirement === undefined ? {} : { projectRequirement: options.projectRequirement }),
    }
    this.planning = new ProjectPlanningModel(planningOptions)
  }
}

export type ProjectModelLike = Pick<ProjectModel, 'projectId' | 'nodes' | 'planning'>
