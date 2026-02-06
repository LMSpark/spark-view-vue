/**
 * 树管理器
 * 负责自引用树的懒加载、差量补齐和层级构建
 * 关联到 BindingContext（视图层）而非 DataTable（结构层）
 */

import type {
  TreeConfig,
  FlatTreeNode,
  NestedTreeNode,
  FlatTreeCache,
  TreePath
} from './types'
import { Logger } from '@spark-view/spark-utils'
import type { BindingContext } from './bindingContext'

/**
 * 树管理器类
 * 管理 BindingContext 中的树形数据视图
 */
export class TreeManager {
  private config: TreeConfig
  private cache: FlatTreeCache = {}
  private eventListeners: Map<string, Function[]> = new Map()
  private bindingContext?: BindingContext  // 关联的 BindingContext
  private logger = Logger()

  constructor(config: TreeConfig, initialNodes?: FlatTreeNode[], bindingContext?: BindingContext) {
    this.config = {
      idField: 'id',
      parentIdField: 'parentId',
      textField: 'name',
      lazy: true,
      ...config
    }
        this.bindingContext = bindingContext
        if (initialNodes) {
      this.addNodesToCache(initialNodes)
    }
  }

  /**
   * 设置关联的 BindingContext
   */
  setBindingContext(bindingContext: BindingContext): void {
    this.bindingContext = bindingContext
  }

  /**
   * 获取关联的 BindingContext
   */
  getBindingContext(): BindingContext | undefined {
    return this.bindingContext
  }

  /**
   * 获取树配置
   */
  getConfig(): TreeConfig {
    return { ...this.config }
  }

  /**
   * 获取缓存
   */
  getCache(): FlatTreeCache {
    return { ...this.cache }
  }

  /**
   * 添加节点到缓存
   */
  addNodesToCache(nodes: FlatTreeNode[]): void {
    nodes.forEach(node => {
      this.cache[node.id] = node
    })
    this.emit('cacheUpdated', { cache: this.cache })
  }

  /**
   * 获取节点
   */
  getNode(id: string | number): FlatTreeNode | undefined {
    return this.cache[id]
  }

  /**
   * 获取子节点
   */
  getChildren(parentId: string | number | null): FlatTreeNode[] {
    return Object.values(this.cache).filter(
      node => node.parentId === parentId
    )
  }

  /**
   * 获取根节点
   */
  getRoots(): FlatTreeNode[] {
    return this.getChildren(null)
  }

  /**
   * 展开到目标节点（差量补齐）
   * @param targetId 目标节点 ID
   * @param loadPathFn 加载路径的函数，返回路径 ID 数组
   * @param loadSubTreeFn 加载子树的函数，返回缺失区间的节点
   */
  async expandToNode(
    targetId: string | number,
    loadPathFn: (targetId: string | number) => Promise<TreePath>,
    loadSubTreeFn: (fromId: string | number | null, toId: string | number) => Promise<FlatTreeNode[]>
  ): Promise<void> {
    // 1. 获取目标节点的祖先链 ID
    const path = await loadPathFn(targetId)
    const { pathIds } = path

    // 2. 对比缓存，找出缺失的节点
    const missing = pathIds.filter(id => !this.cache[id])

    if (missing.length === 0) {
      this.logger.info(`路径已完整缓存，无需补齐`)
      return
    }

    // 3. 找到第一个缺失节点的父节点
    const firstMissing = missing[0]
    if (firstMissing === undefined) {
      return
    }
    const firstMissingIndex = pathIds.indexOf(firstMissing)
    const fromId = firstMissingIndex > 0 ? pathIds[firstMissingIndex - 1] ?? null : null

    // 4. 一次性拉取缺失区间
    this.logger.info(`差量补齐: 从 ${fromId} 到 ${targetId}`)
    const nodes = await loadSubTreeFn(fromId, targetId)

    // 5. 更新缓存
    this.addNodesToCache(nodes)

    this.emit('pathExpanded', { targetId, path, missing })
  }

  /**
   * 搜索节点
   * @param keyword 搜索关键词
   * @param matchFn 匹配函数，返回是否匹配
   */
  searchNodes(keyword: string, matchFn?: (node: FlatTreeNode, keyword: string) => boolean): FlatTreeNode[] {
    const defaultMatchFn = (node: FlatTreeNode, kw: string) => {
      const textField = this.config.textField ?? 'name'
      const text = node[textField]
      return typeof text === 'string' && text.toLowerCase().includes(kw.toLowerCase())
    }

    const matcher = matchFn ?? defaultMatchFn

    return Object.values(this.cache).filter(node => matcher(node, keyword))
  }

  /**
   * 获取节点路径
   */
  getNodePath(nodeId: string | number): TreePath {
    const pathIds: Array<string | number> = []
    const pathNodes: FlatTreeNode[] = []

    let currentId: string | number | null | undefined = nodeId

    while (currentId !== null && currentId !== undefined) {
      const node: FlatTreeNode | undefined = this.cache[currentId]
      if (!node) break

      pathIds.unshift(currentId)
      pathNodes.unshift(node)

      currentId = node.parentId
    }

    return { pathIds, pathNodes }
  }

  /**
   * 全量构建嵌套树
   */
  buildNestedTree(rootId?: string | number | null): NestedTreeNode[] {
    const roots: NestedTreeNode[] = []

    // 获取根节点
    const rootNodes = rootId !== undefined && rootId !== null
      ? (this.cache[rootId] ? [this.cache[rootId]] : [])
      : this.getRoots()

    rootNodes.forEach(rootNode => {
      if (rootNode) {
        const nestedRoot = this.buildSubTree(rootNode.id)
        if (nestedRoot) {
          roots.push(nestedRoot)
        }
      }
    })

    return roots
  }

  /**
   * 局部构建子树（递归）
   */
  buildSubTree(rootId: string | number): NestedTreeNode | null {
    const node = this.cache[rootId]
    if (!node) return null

    const nestedNode: NestedTreeNode = { ...node, children: [] }

    // 递归构建子节点
    const children = this.getChildren(rootId)
    children.forEach(child => {
      const childTree = this.buildSubTree(child.id)
      if (childTree) {
        nestedNode.children.push(childTree)
      }
    })

    return nestedNode
  }

  /**
   * 计算节点层级
   */
  calculateLevel(nodeId: string | number): number {
    const path = this.getNodePath(nodeId)
    return path.pathIds.length - 1
  }

  /**
   * 标记节点是否有子节点
   */
  markHasChildren(nodeId: string | number): void {
    const node = this.cache[nodeId]
    if (!node) return

    const children = this.getChildren(nodeId)
    if (node) {
      node.hasChildren = children.length > 0
    }
  }

  /**
   * 批量标记所有节点的 hasChildren 和 level
   */
  enrichNodes(): void {
    Object.keys(this.cache).forEach(id => {
      const node = this.cache[id]
      if (node) {
        node.level = this.calculateLevel(node.id)
        this.markHasChildren(node.id)
      }
    })
  }

  /**
   * 事件监听
   */
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.push(callback)
    }
  }

  /**
   * 移除事件监听
   */
  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * 触发事件
   */
  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(data))
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache = {}
    this.emit('cacheCleared', {})
  }

  /**
   * 导出为 JSON
   */
  toJSON(): string {
    return JSON.stringify({
      config: this.config,
      cache: this.cache
    }, null, 2)
  }

  /**
   * 从 JSON 加载
   */
  static fromJSON(json: string, bindingContext?: BindingContext): TreeManager {
    const data = JSON.parse(json)
    const manager = new TreeManager(data.config, undefined, bindingContext)
    manager.cache = data.cache
    return manager
  }
}
