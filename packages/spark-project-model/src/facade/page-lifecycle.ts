import type { ProjectNodeData } from '../model/navigation/node'
import type {
  NavigationNodeEditInputDto,
} from '../model/navigation/edit'
import {
  applyNavigationNodeEditDtoToNode,
  applyNodeKindPresetToEditDto,
  createNavigationNodeEditDto,
} from '../model/navigation/edit'
import type { PageFileCreateOptions } from '../model/page/file'
import type {
  PageNavigationLifecycle,
  PageNavigationMountParams,
} from '../io/navigation/lifecycle'
import type { PageContentRepository } from '../io/page-content-repository'
import type { ProjectEditorContext } from './project-editor-context'
import type { CreatePageForSelectedNodeParams } from './project-editor-types'
import type { NavigationEditor } from './navigation-editor'

type CreateMountedPageParams = Omit<PageNavigationMountParams, 'pageId'> & {
  pageId: string
  rollbackPageOnNavigationFailure?: boolean
}

type ProjectEditorCreatePageParams = PageFileCreateOptions & {
  pageId: string
}

export type PageNodeCreateMountedResult = {
  page: Record<string, unknown>
  node: ProjectNodeData
}

export type PageNodeRemoveMountedResult = {
  deletedNode: ProjectNodeData | null
  deletedFiles: boolean
}

type RemoveMountedPageParams = {
  pageId: string
  nodeId?: string
  deleteFiles?: boolean
}

export class PageLifecycle {
  constructor(
    private readonly ctx: ProjectEditorContext,
    private readonly repository: PageContentRepository,
    private readonly navigationLifecycle: PageNavigationLifecycle,
    private readonly navigation: NavigationEditor,
    private readonly getActivePage: () => ReturnType<ProjectEditorContext['getActivePage']>,
    private readonly clearActivePage: () => void,
  ) {}

  async createPageForSelectedNode(params: CreatePageForSelectedNodeParams): Promise<PageNodeCreateMountedResult> {
    const pageId = params.pageId.trim()
    if (!pageId) {
      throw new Error('pageId 不能为空')
    }
    const selected = this.ctx.requireSelectedNode('未选中导航节点，无法创建并绑定页面')
    const pageNode = this.ctx.openPage(pageId)
    const page = await this.repository.createPageFiles(pageNode, {
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.icon === undefined ? {} : { icon: params.icon }),
    })

    const previousEditDto = createNavigationNodeEditDto(selected)
    try {
      const nextEditDto: NavigationNodeEditInputDto = {
        ...previousEditDto,
        node: {
          ...applyNodeKindPresetToEditDto(previousEditDto.node, 'page'),
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          title: params.title?.trim() || previousEditDto.node.title || pageId,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through to default
          icon: params.icon?.trim() || previousEditDto.node.icon,
          path: `/${pageId}`,
        },
      }
      applyNavigationNodeEditDtoToNode(selected, nextEditDto)
      this.ctx.session.setSelectedNodeId(selected.id)
      this.ctx.session.markNavigationDirty('node')
      await this.navigation.saveSelectedNavigationNode()
      this.ctx.session.setActivePageId(pageId)
      this.ctx.session.bump()
      return { page, node: this.ctx.getSelectedNode() ?? selected }
    } catch (error) {
      applyNavigationNodeEditDtoToNode(selected, previousEditDto)
      this.ctx.session.setSelectedNodeId(selected.id)
      this.ctx.session.markNavigationClean()
      await this.repository.deletePageFiles(pageNode)
      this.ctx.session.bump()
      throw error
    }
  }

  async createMountedPage(params: CreateMountedPageParams): Promise<PageNodeCreateMountedResult> {
    const { pageId, ...modelParams } = params
    const pageNode = this.ctx.openPage(pageId)
    const page = await this.repository.createPageFiles(pageNode, {
      ...(modelParams.title === undefined ? {} : { title: modelParams.title }),
      ...(modelParams.icon === undefined ? {} : { icon: modelParams.icon }),
    })
    try {
      const node = await this.navigationLifecycle.mountPage({ pageId, ...modelParams })
      await this.navigation.reloadNavigation({ selectedNodeId: node.id })
      return { page, node }
    } catch (error) {
      if (modelParams.rollbackPageOnNavigationFailure === true) {
        await this.repository.deletePageFiles(pageNode)
      }
      throw error
    }
  }

  async createPageFiles(params: ProjectEditorCreatePageParams): Promise<Record<string, unknown>> {
    const { pageId, ...modelParams } = params
    const pageNode = this.ctx.openPage(pageId)
    const result = await this.repository.createPageFiles(pageNode, {
      ...(modelParams.title === undefined ? {} : { title: modelParams.title }),
      ...(modelParams.icon === undefined ? {} : { icon: modelParams.icon }),
    })
    this.ctx.session.bump()
    return result
  }

  async deletePageFiles(pageId: string): Promise<void> {
    const normalized = pageId.trim()
    const pageNode = this.ctx.design.openConfigPage(normalized)
    await this.repository.deletePageFiles(pageNode)
    if (this.getActivePage()?.pageId === normalized) {
      this.clearActivePage()
    }
    this.ctx.closePage(normalized)
    this.ctx.session.bump()
  }

  async removeMountedPage(params: RemoveMountedPageParams): Promise<PageNodeRemoveMountedResult> {
    const deletedNode = await this.navigationLifecycle.unmountPage(params.pageId, params.nodeId)
    const shouldDeleteFiles = params.deleteFiles !== false
    if (shouldDeleteFiles) {
      const pageNode = this.ctx.design.openConfigPage(params.pageId)
      await this.repository.deletePageFiles(pageNode)
    }
    const result = { deletedNode, deletedFiles: shouldDeleteFiles }
    if (this.getActivePage()?.pageId === params.pageId) {
      this.clearActivePage()
    }
    await this.navigation.reloadNavigation({ selectedNodeId: this.ctx.session.session.selectedNodeId })
    return result
  }

  async moveMountedPage(
    nodeId: string,
    newParentId: string | null,
    index: number,
  ): Promise<ProjectNodeData> {
    const result = await this.navigationLifecycle.moveMountedPage(nodeId, newParentId, index)
    await this.navigation.reloadNavigation({ selectedNodeId: nodeId })
    return result
  }
}
