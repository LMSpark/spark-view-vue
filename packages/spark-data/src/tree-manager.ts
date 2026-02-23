/**
 * 树管理器
 * 负责自引用树的懒加载、差量补齐和层级构建
 * 关联到 DataView（视图层）而非 DataTable（结构层）
 */

import type {
  TreeConfig,
  FlatTreeNode,
  NestedTreeNode,
  TreePath
} from './types'

type FlatTreeCache = Record<string | number, FlatTreeNode>
import { Logger } from '@spark-view/spark-utils'
import type { DataView } from './data-view'

/**
 * 树管理器类
 * 管理 DataView 中的树形数据视图
 */
export class TreeManager {
  // ===== 属性定义 =====

  /** 树配置 */
  private config: TreeConfig

  /** 节点缓存 */
  private cache: FlatTreeCache = {}

  /** 关联的数据视图 */
  private dataView?: DataView

  /** 日志记录器 */
  private logger = Logger()

  // ===== 构造函数 =====

  /**
   * 创建树管理器实例
   * @param config 树配置
   * @param initialNodes 初始节点
   * @param dataView 关联的数据视图
   */
  constructor(config: TreeConfig, initialNodes?: FlatTreeNode[], dataView?: DataView) {
    this.config = {
      idField: 'id',
      parentIdField: 'parentId',
      textField: 'name',
      lazy: true,
      ...config
    }
    if (dataView) {
      this.dataView = dataView
    }
    if (initialNodes) {
      this.addNodesToCache(initialNodes)
    }
  }

  // ===== DataView 关联 =====

  /**
   * 设置关联的数据视图
   * @param dataView 数据视图实例
   */
  setDataView(dataView: DataView): void {
    this.dataView = dataView
  }

  /**
   * 获取关联的数据视图
   * @returns 数据视图实例
   */
  getDataView(): DataView | undefined {
    return this.dataView
  }

  // ===== 配置和缓存访问 =====

  /**
   * 获取树配置
   * @returns 树配置副本
   */
  getConfig(): TreeConfig {
    return { ...this.config }
  }

  /**
   * 获取节点缓存
   * @returns 缓存副本
   */
  getCache(): FlatTreeCache {
    return { ...this.cache }
  }

  // ===== 缓存管理 =====

  /**
   * 添加节点到缓存
   * @param nodes 要添加的节点数组
   */
  addNodesToCache(nodes: FlatTreeNode[]): void {
    for (const node of nodes) {
      this.cache[node.id] = node
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache = {}
  }

  // ===== 节点查询 =====

  /**
   * 获取指定节点
   * @param id 节点ID
   * @returns 节点对象
   */
  getNode(id: string | number): FlatTreeNode | undefined {
    return this.cache[id]
  }

  /**
   * 获取子节点
   * @param parentId 父节点ID
   * @returns 子节点数组
   */
  getChildren(parentId: string | number | null): FlatTreeNode[] {
    return Object.values(this.cache).filter(
      node => node.parentId === parentId
    )
  }

  /**
   * 获取根节点
   * @returns 根节点数组
   */
  getRoots(): FlatTreeNode[] {
    return this.getChildren(null)
  }

  // ===== 树展开和补齐 =====

  /**
   * 展开到目标节点（差量补齐）
   * @param targetId 目标节点ID
   * @param loadPathFn 加载路径的函数
   * @param loadSubTreeFn 加载子树的函数
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
  }

  // ===== 搜索功能 =====

  /**
   * 搜索节点
   * @param keyword 搜索关键词
   * @param matchFn 匹配函数
   * @returns 匹配的节点数组
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

  // ===== 路径和层级 =====

  /**
   * 获取节点路径
   * @param nodeId 节点ID
   * @returns 节点路径
   */
  getNodePath(nodeId: string | number): TreePath {
    const pathIds: Array<string | number> = []
    const pathNodes: FlatTreeNode[] = []
    const visited = new Set<string | number>()

    let currentId: string | number | null | undefined = nodeId

    while (currentId !== null && currentId !== undefined) {
      if (visited.has(currentId)) break  // 防止循环引用导致无限循环
      visited.add(currentId)

      const node: FlatTreeNode | undefined = this.cache[currentId]
      if (!node) break

      pathIds.unshift(currentId)
      pathNodes.unshift(node)

      currentId = node.parentId
    }

    return { pathIds, pathNodes }
  }

  /**
   * 计算节点层级
   * @param nodeId 节点ID
   * @returns 节点层级
   */
  calculateLevel(nodeId: string | number): number {
    const path = this.getNodePath(nodeId)
    return path.pathIds.length - 1
  }

  // ===== 树构建 =====

  /**
   * 全量构建嵌套树
   * @param rootId 根节点ID
   * @returns 嵌套树数组
   */
  buildNestedTree(rootId?: string | number | null): NestedTreeNode[] {
    const roots: NestedTreeNode[] = []

    // 获取根节点
    const rootNodes = rootId !== undefined && rootId !== null
      ? (this.cache[rootId] ? [this.cache[rootId]] : [])
      : this.getRoots()

    for (const rootNode of rootNodes) {
      if (rootNode) {
        const nestedRoot = this.buildSubTree(rootNode.id)
        if (nestedRoot) {
          roots.push(nestedRoot)
        }
      }
    }

    return roots
  }

  /**
   * 局部构建子树（递归）
   * @param rootId 根节点ID
   * @returns 嵌套子树
   */
  buildSubTree(rootId: string | number): NestedTreeNode | null {
    const node = this.cache[rootId]
    if (!node) return null

    const nestedNode: NestedTreeNode = { ...node, children: [] }

    // 递归构建子节点
    const children = this.getChildren(rootId)
    for (const child of children) {
      const childTree = this.buildSubTree(child.id)
      if (childTree) {
        nestedNode.children.push(childTree)
      }
    }

    return nestedNode
  }

  // ===== 节点属性管理 =====

  /**
   * 标记节点是否有子节点
   * @param nodeId 节点ID
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
    for (const id of Object.keys(this.cache)) {
      const node = this.cache[id]
      if (node) {
        node.level = this.calculateLevel(node.id)
        this.markHasChildren(node.id)
      }
    }
  }

  // ===== 序列化 =====

  /**
   * 导出为JSON字符串
   * @returns JSON字符串
   */
  toJSON(): string {
    return JSON.stringify({
      config: this.config,
      cache: this.cache
    }, null, 2)
  }

  // ===== 反序列化工厂方法 =====

  /**
   * 从JSON字符串创建树管理器实例
   * @param json JSON字符串
   * @param dataView 关联的数据视图
   * @returns 树管理器实例
   */
  static fromJSON(json: string, dataView?: DataView): TreeManager {
    const data = JSON.parse(json) as { config: TreeConfig; cache: FlatTreeNode[] | Record<string | number, FlatTreeNode> }
    const manager = new TreeManager(data.config, undefined, dataView)
    // 兼容数组格式和对象格式（toJSON 序列化为对象）
    if (Array.isArray(data.cache)) {
      for (const node of data.cache) {
        manager.cache[node.id] = node
      }
    } else if (data.cache && typeof data.cache === 'object') {
      for (const node of Object.values(data.cache)) {
        manager.cache[node.id] = node
      }
    }
    return manager
  }
}
