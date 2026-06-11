import { SparkAIModel } from '@spark-appworks/spark-utils'
import type { NavigationRowModel } from '../navigation/navigation-row-model'
import type { PageConfigModel } from '../page/page-config-model'

/** 项目根模型事件。 */
export class ProjectRootModelEvent {
  type: 'navigation.changed' | 'selection.changed'
  revision: number

  constructor(type: ProjectRootModelEvent['type'], revision: number) {
    this.type = type
    this.revision = revision
  }
}

/**
 * 项目根领域模型。
 *
 * 持有导航扁平行集合；Vue 经 subscribe 刷新，AI 经公开属性与 API 读写。
 */
export class ProjectRootModel extends SparkAIModel {
  projectId: string
  name: string
  tenantId: string
  navigationNodes: NavigationRowModel[]
  selectedNodeId: string | null
  dirty: boolean
  revision: number

  private readonly listeners = new Set<(event: ProjectRootModelEvent) => void>()

  /**
   * @param options.projectId 项目 ID。
   * @param options.name 项目名称。
   * @param options.tenantId 租户 ID。
   * @param options.navigationNodes 初始导航节点。
   */
  constructor(options: {
    projectId: string
    name: string
    tenantId: string
    navigationNodes?: NavigationRowModel[]
  }) {
    super(options)
    this.projectId = options.projectId
    this.name = options.name
    this.tenantId = options.tenantId
    this.navigationNodes = options.navigationNodes ?? []
    this.selectedNodeId = null
    this.dirty = false
    this.revision = 0
  }

  toJson(): Record<string, unknown> {
    return {
      projectId: this.projectId,
      name: this.name,
      tenantId: this.tenantId,
      selectedNodeId: this.selectedNodeId,
      dirty: this.dirty,
      revision: this.revision,
      navigationNodes: this.navigationNodes.map((node) => node.toJson()),
    }
  }

  save(): void {
    throw new Error('ProjectRootModel.save: not implemented')
  }

  static load(projectId: string): ProjectRootModel {
    throw new Error(`ProjectRootModel.load: not implemented (${projectId})`)
  }

  subscribe(listener: (event: ProjectRootModelEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  selectNavigationNode(id: string | null): void {
    this.selectedNodeId = id
    this.emit('selection.changed')
  }

  findNavigationNode(id: string): NavigationRowModel | null {
    return this.navigationNodes.find((node) => node.id === id) ?? null
  }

  addNavigationNode(node: NavigationRowModel): NavigationRowModel {
    this.navigationNodes.push(node)
    this.dirty = true
    this.emit('navigation.changed')
    return node
  }

  updateNavigationNode(
    id: string,
    patch: {
      parentId?: string
      title?: string
      description?: string
      nodeKind?: string
      pageConfig?: PageConfigModel | null
    },
  ): NavigationRowModel {
    const node = this.findNavigationNode(id)
    if (node === null) {
      throw new Error(`ProjectRootModel: navigation node not found: ${id}`)
    }
    Object.assign(node, patch)
    this.dirty = true
    this.emit('navigation.changed')
    return node
  }

  removeNavigationNode(id: string): NavigationRowModel {
    const index = this.navigationNodes.findIndex((node) => node.id === id)
    if (index < 0) {
      throw new Error(`ProjectRootModel: navigation node not found: ${id}`)
    }
    const removed = this.navigationNodes[index]
    if (removed === undefined) {
      throw new Error(`ProjectRootModel: navigation node not found: ${id}`)
    }
    this.navigationNodes.splice(index, 1)
    if (this.selectedNodeId === id) {
      this.selectedNodeId = null
    }
    this.dirty = true
    this.emit('navigation.changed')
    return removed
  }

  private emit(type: ProjectRootModelEvent['type']): void {
    this.revision += 1
    const event = new ProjectRootModelEvent(type, this.revision)
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
