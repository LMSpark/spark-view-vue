import type {
  NavNodeKind,
  ProjectModelData,
  ProjectNodeData,
} from '../model/navigation/node'
import type {
  NavigationNodeEditApplyResultDto,
  NavigationNodeEditInputDto,
  NavigationNodeEditPatchDto,
} from '../model/navigation/edit'
import {
  applyNavigationNodeEditDtoToNode,
  applyNodeKindPresetToEditDto,
  createNavigationNodeEditDto,
  createNavigationNodePatch,
} from '../model/navigation/edit'
import { createReservedRootGroup } from '../model/navigation/helpers'
import type { NavigationConfigClient } from '../io/navigation/client'
import type { ProjectEditorContext } from './project-editor-context'

export class NavigationEditor {
  constructor(
    private readonly ctx: ProjectEditorContext,
    private readonly navClient: NavigationConfigClient,
  ) {}

  async loadNavigation(): Promise<ProjectModelData> {
    return this.reloadNavigation()
  }

  /**
   * 灌入已由 APP 壳层加载的导航根（如 refreshRoutes 结果），避免重复 HTTP。
   */
  ingestNavigationRoot(
    root: ProjectModelData,
    options?: { selectedNodeId?: string | null },
  ): ProjectModelData {
    this.ctx.design.replaceRoot(root)
    const selectedNodeId = options?.selectedNodeId ?? null
    if (selectedNodeId && this.ctx.design.findNodeById(selectedNodeId)) {
      this.ctx.session.setSelectedNodeId(selectedNodeId)
    } else {
      this.ctx.session.setSelectedNodeId(null)
    }
    this.ctx.session.syncWithModel()
    this.ctx.session.markNavigationClean()
    this.ctx.refreshNavRefs()
    this.ctx.session.bump()
    return root
  }

  selectNode(nodeId: string | null): void {
    this.ctx.session.setSelectedNodeId(nodeId)
    this.ctx.session.bump()
  }

  applyNavigationEditDto(input: NavigationNodeEditInputDto): NavigationNodeEditApplyResultDto {
    const node = this.ctx.requireSelectedNode('未选中导航节点，无法编辑导航属性')
    const result = applyNavigationNodeEditDtoToNode(node, input)
    this.ctx.session.setSelectedNodeId(node.id)
    this.ctx.session.setWorkingEditDto(createNavigationNodeEditDto(node))
    this.ctx.session.markNavigationDirty('node')
    this.ctx.session.bump()
    return result
  }

  applyNodeKindPreset(kind: NavNodeKind): void {
    const node = this.ctx.requireSelectedNode('未选中导航节点，无法修改节点类型')
    const nodeDto = createNavigationNodeEditDto(node)
    const updatedNode = applyNodeKindPresetToEditDto(nodeDto.node, kind)
    const mergedInput: NavigationNodeEditInputDto = {
      ...nodeDto,
      node: updatedNode,
    }
    applyNavigationNodeEditDtoToNode(node, mergedInput)
    this.ctx.session.setWorkingEditDto(createNavigationNodeEditDto(node))
    this.ctx.session.setSelectedNodeId(node.id)
    this.ctx.session.markNavigationDirty('node')
    this.ctx.session.bump()
  }

  get navigationEditDto(): NavigationNodeEditInputDto | null {
    return this.ctx.session.navigationEditDto
  }

  get isNavigationEditing(): boolean {
    return this.ctx.session.isNavigationEditing
  }

  beginNavigationEdit(): NavigationNodeEditInputDto {
    const node = this.ctx.requireSelectedNode('未选中导航节点，无法开始导航编辑')
    const dto = this.ctx.session.beginNavigationEdit(createNavigationNodeEditDto(node))
    this.ctx.session.bump()
    return dto
  }

  discardNavigationEdit(): void {
    this.ctx.session.discardNavigationEdit()
    this.ctx.session.bump()
  }

  async saveSelectedNavigationNode(options?: { skipReload?: boolean }): Promise<void> {
    let nodeId: string
    let patch: NavigationNodeEditPatchDto & Pick<ProjectNodeData, 'title' | 'nodeKind'>

    const workingDto = this.ctx.session.navigationEditDto
    if (workingDto !== null) {
      const result = createNavigationNodePatch(workingDto)
      nodeId = workingDto.node.id
      patch = result.patch
    } else {
      const node = this.ctx.requireSelectedNode('未选中导航节点，无法保存导航属性')
      const nodeDto = createNavigationNodeEditDto(node)
      const result = createNavigationNodePatch(nodeDto)
      nodeId = node.id
      patch = result.patch
    }

    await this.navClient.updateNode(nodeId, patch)
    this.ctx.session.setWorkingEditDto(null)
    if (options?.skipReload === true) {
      this.ctx.session.markNavigationClean()
      this.ctx.session.bump()
      return
    }
    await this.reloadNavigation({ selectedNodeId: nodeId })
  }

  async saveNavigationFromSession(): Promise<void> {
    const navDirty = this.ctx.session.navigationDirty
    if (!navDirty) return

    if (this.ctx.session.session.navigationDirtyScope === 'root') {
      throw new Error('导航编辑必须按节点提交，不能整树保存')
    }
    await this.saveSelectedNavigationNode()
    this.ctx.session.markNavigationClean()
  }

  addRootNode(createId: () => string): ProjectNodeData {
    const node = this.ctx.design.addRootModule(createId)
    this.ctx.session.markNavigationDirty('root')
    this.ctx.session.bump()
    return node
  }

  async addNavigationNode(params: {
    parentId?: string | null
    node: ProjectNodeData
    index?: number
  }): Promise<ProjectNodeData> {
    const node = await this.navClient.addNode(params)
    await this.reloadNavigation({ selectedNodeId: node.id })
    return node
  }

  addChildPageNode(createId: () => string): ProjectNodeData {
    const selected = this.ctx.getSelectedNode()
    const node = this.ctx.design.addChildPage(createId, selected)
    this.ctx.session.markNavigationDirty('root')
    this.ctx.session.bump()
    return node
  }

  removeNode(nodeId: string): ProjectNodeData | null {
    const normalized = nodeId.trim()
    const removed = this.ctx.design.removeNode(normalized)
    this.ctx.session.syncWithModel()
    this.ctx.session.markNavigationDirty('root')
    this.ctx.session.bump()
    return removed
  }

  async deleteNode(nodeId: string): Promise<ProjectNodeData | null> {
    const normalized = nodeId.trim()
    if (!normalized) {
      throw new Error('nodeId 不能为空')
    }
    const result = await this.navClient.deleteNode(normalized)
    const root = await this.navClient.loadRoot()
    this.ctx.design.replaceRoot(root)
    this.ctx.session.bump()
    return result
  }

  restoreReservedRootGroup(placement: 'toolbar' | 'user-menu', createId: () => string): ProjectNodeData {
    const node = createReservedRootGroup(placement, {
      createId,
      templateRoot: this.ctx.design.navigationRoot,
    })
    const children = this.ctx.project.toTree()
    const existingIndex = children.findIndex(
      child => child.childPlacement === placement,
    )
    if (existingIndex >= 0) {
      children[existingIndex] = node
    } else {
      children.unshift(node)
    }
    this.ctx.design.replaceNavigationChildren(children)
    this.ctx.session.markNavigationDirty('root')
    this.ctx.session.bump()
    return node
  }

  async reloadNavigation(options?: { selectedNodeId?: string | null }): Promise<ProjectModelData> {
    const root = await this.navClient.loadRoot()
    this.ctx.design.replaceRoot(root)
    const selectedNodeId = options?.selectedNodeId ?? null
    if (selectedNodeId && this.ctx.design.findNodeById(selectedNodeId)) {
      this.ctx.session.setSelectedNodeId(selectedNodeId)
    } else {
      this.ctx.session.setSelectedNodeId(null)
    }
    this.ctx.session.syncWithModel()
    this.ctx.session.markNavigationClean()
    this.ctx.refreshNavRefs()
    this.ctx.session.bump()
    return root
  }
}
