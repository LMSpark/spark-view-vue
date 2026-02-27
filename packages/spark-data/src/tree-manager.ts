/**
 * 树管理器
 * 统一入口：内存缓存 + HTTP 调用（含 flat/nested 双模式接口族）
 * 依赖方向：DataView → TreeManager（单向）
 */

import type {
  TreeConfig,
  TreeApi,
  HttpEndpoint,
  FlatTreeNode,
  NestedTreeNode,
  NestedTreeSearchResult,
  TreePath
} from './types'
import { resolveUrlTemplate } from './core/url-template'

import { Logger, createRequest, type Request } from '@spark-view/spark-utils'

/**
 * 树管理器类
 * 管理 DataView 中的树形数据视图
 */
export class TreeManager {
  // ===== 属性定义 =====

  /** 树配置 */
  private config: TreeConfig

  /** 节点缓存 */
  private cache: Record<string | number, FlatTreeNode> = {}

  /** 树 HTTP 接口族配置（来自 DataTable.treeApi，可选） */
  private api?: TreeApi

  /** HTTP 客户端（优先使用外部注入的实例，共享拦截器/认证/配置；否则懒初始化独立实例） */
  private _http?: Request

  /** 日志记录器 */
  private logger = Logger()

  // ===== 构造函数 =====

  /**
   * 创建树管理器实例
   * @param config 树配置
   * @param initialNodes 初始节点
   * @param dataView 关联的数据视图
   */
  constructor(config: TreeConfig, api?: TreeApi, initialNodes?: FlatTreeNode[], httpClient?: Request) {
    this.config = {
      idField: 'id',
      parentIdField: 'parentId',
      textField: 'name',
      lazy: true,
      ...config
    }
    if (api) this.api = api
    if (httpClient) this._http = httpClient
    if (initialNodes) {
      this.addNodesToCache(initialNodes)
    }
  }

  // ===== HTTP 辅助 =====

  private _getHttp(): Request {
    this._http ??= createRequest()
    return this._http
  }

  /**
   * 调用树端点（自动替换 URL 路径参数，剩余参数作为 query/body）
   */
  private _callEndpoint<T>(endpoint: HttpEndpoint, params: Record<string, unknown> = {}): Promise<T> {
    const { url, rest } = resolveUrlTemplate(endpoint.url, params)
    const http = this._getHttp()
    const method = endpoint.method ?? 'GET'
    const config = endpoint.headers ? { headers: endpoint.headers } : {}
    if (method === 'GET') return http.get<T>(url, rest, config)
    return http.post<T>(url, params, config)
  }

  // ===== 配置和缓存访问 =====

  /**
   * 获取树配置
   * @returns 树配置副本
   */
  getConfig(): TreeConfig {
    return { ...this.config }
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

  // ===== HTTP 树操作（需配置 api） =====

  /**
   * 拉取直接子节点并写入缓存（对应 /tree/children）
   */
  async fetchChildren(parentId: string | number | null, limit?: number): Promise<FlatTreeNode[]> {
    const endpoint = this.api?.children
    if (!endpoint) throw new Error('[TreeManager] api.children 未配置')
    const params: Record<string, unknown> = { parentId: parentId ?? '' }
    const effectiveLimit = limit ?? endpoint.limit
    if (effectiveLimit !== undefined) params['limit'] = effectiveLimit
    const nodes = await this._callEndpoint<FlatTreeNode[]>(endpoint, params)
    this.addNodesToCache(nodes)
    return nodes
  }

  /**
   * 获取节点祖先链 ID（对应 /tree/path）
   */
  async fetchPath(id: string | number): Promise<TreePath> {
    const endpoint = this.api?.path
    if (!endpoint) throw new Error('[TreeManager] api.path 未配置')
    const result = await this._callEndpoint<{ pathIds: Array<string | number> }>(endpoint, { id })
    return { pathIds: result.pathIds }
  }

  /**
   * 展开到目标节点（差量补齐缓存，对应 /tree/path + /tree/subtree）
   */
  async expandToNode(targetId: string | number): Promise<void> {
    // 1. 获取祖先链
    const { pathIds } = await this.fetchPath(targetId)

    // 2. 找出缓存缺失节点
    const missing = pathIds.filter(id => !this.cache[id])
    if (missing.length === 0) {
      this.logger.info('路径已完整缓存，无需补齐')
      return
    }

    // 3. 确定补齐起点
    const firstMissing = missing[0]
    if (firstMissing === undefined) return
    const firstMissingIndex = pathIds.indexOf(firstMissing)
    const fromId = firstMissingIndex > 0 ? pathIds[firstMissingIndex - 1] ?? null : null

    // 4. 拉取缺失区间
    const subtreeEndpoint = this.api?.subtree
    if (!subtreeEndpoint) throw new Error('[TreeManager] api.subtree 未配置')
    this.logger.info(`差量补齐: 从 ${fromId} 到 ${targetId}`)
    const params: Record<string, unknown> = {
      toId: targetId,
      includeTargetChildren: subtreeEndpoint.includeTargetChildren ?? true,
    }
    if (fromId !== null) params['fromId'] = fromId
    const result = await this._callEndpoint<Record<string, FlatTreeNode>>(subtreeEndpoint, params)
    this.addNodesToCache(Object.values(result))
  }

  /**
   * 嵌套模式远端搜索，返回匹配节点 + 祖先链（对应 /tree/nested/search）
   */
  async fetchNestedSearch(keyword: string, limit?: number): Promise<NestedTreeSearchResult[]> {
    const endpoint = this.api?.nestedSearch
    if (!endpoint) throw new Error('[TreeManager] api.nestedSearch 未配置')
    const params: Record<string, unknown> = { keyword }
    const effectiveLimit = limit ?? endpoint.limit
    if (effectiveLimit !== undefined) params['limit'] = effectiveLimit
    return this._callEndpoint<NestedTreeSearchResult[]>(endpoint, params)
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

  /**
   * 嵌套树搜索（层次模式）
   * 对应 /tree/nested/search 接口
   * 返回匹配节点及其祖先链，前端可直接展开定位
   * @param keyword 搜索关键词
   * @param matchFn 自定义匹配函数（默认匹配 textField）
   * @param limit 最大返回结果数（默认不限制）
   * @returns 匹配节点 + 从根到该节点的祖先链数组
   */
  searchNested(
    keyword: string,
    matchFn?: (node: FlatTreeNode, keyword: string) => boolean,
    limit?: number
  ): NestedTreeSearchResult[] {
    const hits = this.searchNodes(keyword, matchFn)
    const limited = limit !== undefined ? hits.slice(0, limit) : hits

    return limited.map(node => {
      const { pathNodes } = this.getNodePath(node.id)
      return {
        node,
        path: pathNodes ?? [node]
      }
    })
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

}

