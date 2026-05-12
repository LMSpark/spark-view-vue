import { isSparkNode, normalizeSparkNode, nodeId as readNodeId, type SparkNode, type SparkNodeChildren } from './spark-node.js'
import { SnapshotHistory } from '@spark-view/spark-utils'

export const SPARK_PAGE_NODE_TYPE = 'spark-page'
export const SPARK_PAGE_ROOT_ID = 'spark-page-root'

function isSameSparkNodeSnapshot(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export type SparkNodeTreeJsonInput = SparkNode | Record<string, unknown> | string
export type SparkNodeTreeRuleJsonInput =
  | SparkNode
  | readonly SparkNode[]
  | Record<string, unknown>
  | ReadonlyArray<Record<string, unknown>>
  | string

function createSparkPageRoot(children: readonly SparkNode[] = []): SparkNode {
  return {
    type: SPARK_PAGE_NODE_TYPE,
    id: SPARK_PAGE_ROOT_ID,
    children: [...children],
  }
}

// ====================
// 公共参数与结果类型
// ====================

/**
 * 创建 SparkNodeTree 实例时的输入参数。
 */
export interface SparkNodeTreeRootParams {
  /**
   * 当前被编辑的组件实例节点。
   *
   * 可以是任意 SparkNode，包括页面组件；后续所有操作都围绕该节点及其递归子树展开。
   */
  root: SparkNode
  /**
   * 历史记录的最大条目数。默认 50。
   * 设为 0 时禁用历史记录（undo/redo 不可用）。
   */
  historyLimit?: number
}

/**
 * SparkNodeTree.fromJson 的可选参数。
 */
export interface SparkNodeTreeFromJsonOptions {
  /**
   * 历史记录最大条目数。省略时沿用默认值。
   */
  historyLimit?: number
  /**
   * 是否在反序列化时为缺失 id 的节点自动补齐组件 id。默认 true。
   */
  fillMissingComponentId?: boolean
}

/**
 * 需要按 componentId 查找节点时使用的参数。
 */
export interface SparkNodeTreeLookupParams {
  componentId: string
}

/**
 * 需要定位某个父节点 children 时使用的参数。
 */
export interface SparkNodeTreeChildrenParams {
  parentComponentId?: string | null
}

/**
 * 添加节点时使用的参数。
 */
export interface SparkNodeTreeAddParams extends SparkNodeTreeChildrenParams {
  node: SparkNode
  index?: number
}

/**
 * 批量添加节点时使用的参数。
 */
export interface SparkNodeTreeAddNodesParams extends SparkNodeTreeChildrenParams {
  nodes: SparkNode[]
  index?: number
}

/**
 * 移动已有节点时使用的参数。
 */
export interface SparkNodeTreeMoveParams extends SparkNodeTreeChildrenParams {
  componentId: string
  index?: number
}

/**
 * 设置节点 props 时使用的参数。
 */
export interface SparkNodeTreeSetPropsParams extends SparkNodeTreeLookupParams {
  props: Record<string, unknown>
  merge?: boolean
}

/**
 * 批量设置节点 props 的单项参数。
 */
export interface SparkNodeTreeSetPropsBatchItem extends SparkNodeTreeLookupParams {
  props: Record<string, unknown>
  merge?: boolean
}

/**
 * 批量设置节点 props 时使用的参数。
 */
export interface SparkNodeTreeSetPropsBatchParams {
  items: SparkNodeTreeSetPropsBatchItem[]
}

/**
 * 替换整个节点时使用的参数。
 */
export interface SparkNodeTreeReplaceParams extends SparkNodeTreeLookupParams {
  node: SparkNode
}

/**
 * 批量替换节点的单项参数。
 */
export interface SparkNodeTreeReplaceNodesItem extends SparkNodeTreeLookupParams {
  node: SparkNode
}

/**
 * 批量替换节点时使用的参数。
 */
export interface SparkNodeTreeReplaceNodesParams {
  items: SparkNodeTreeReplaceNodesItem[]
}

/**
 * 删除节点时使用的参数。
 */
export interface SparkNodeTreeRemoveParams extends SparkNodeTreeLookupParams {}

/**
 * 批量删除节点时使用的参数。
 */
export interface SparkNodeTreeRemoveNodesParams {
  componentIds: string[]
}

/**
 * 节点在树中的位置信息。
 *
 * - node: 命中的节点本身
 * - parent: 直接父节点；根节点时为 null
 * - index: 在父节点 children 中的直接索引；根节点固定为 -1
 * - depth: 根节点深度为 0，子节点依次递增
 */
export interface SparkNodeLocation {
  node: SparkNode
  parent: SparkNode | null
  index: number
  depth: number
}

/**
 * addNode 的返回结果。
 */
export interface SparkNodeAddResult {
  node: SparkNode
  index: number
}

/**
 * addNodes 的返回结果。
 */
export interface SparkNodeAddNodesResult {
  nodes: SparkNode[]
  indexes: number[]
}

/**
 * moveNode 的返回结果。
 */
export interface SparkNodeMoveResult {
  componentId: string
  fromParentComponentId: string | null
  toParentComponentId: string | null
  previousIndex: number
  index: number
}

/**
 * setProps 的返回结果。
 */
export interface SparkNodeSetPropsResult {
  node: SparkNode
}

/**
 * setPropsBatch 的返回结果。
 */
export interface SparkNodeSetPropsBatchResult {
  nodes: SparkNode[]
}

/**
 * replaceNode 的返回结果。
 */
export interface SparkNodeReplaceResult {
  node: SparkNode
  previous: SparkNode
}

/**
 * replaceNodes 的返回结果。
 */
export interface SparkNodeReplaceNodesResult {
  items: SparkNodeReplaceResult[]
}

/**
 * removeNode 的返回结果。
 */
export interface SparkNodeRemoveResult {
  removed: SparkNode
  index: number
}

/**
 * removeNodes 的返回结果。
 */
export interface SparkNodeRemoveNodesResult {
  items: SparkNodeRemoveResult[]
}

/**
 * findByType 的查询参数。
 */
export interface SparkNodeFindByTypeParams {
  /**
   * 要搜索的组件类型名，精确匹配（如 'r-tabs'、'r-form'、'r-table'）。
   */
  type: string
  /**
   * 可选。从哪个节点开始向下递归搜索。
   * 省略时从当前绑定根节点开始。
   * 必须是真实节点 id，不能是类型名。
   */
  startComponentId?: string
  /**
   * 可选。最多返回多少条匹配结果，默认不限制。
   */
  limit?: number
}

/**
 * findByType 单条匹配结果。
 */
export interface SparkNodeFindByTypeMatch {
  /** 节点的真实 id（来自顶层 id 字段）。节点未设置 id 时为 undefined。 */
  id: string | undefined
  /** 组件类型名 */
  type: string
  /** 节点在树中的深度（根节点深度为 0） */
  depth: number
  /**
   * 直接父节点的 id。
   * - 当前节点是被搜索子树的根时为 null
   * - 父节点未设置 id 时为 undefined
   */
  parentId: string | null | undefined
}

/**
 * findByType 的返回结果。
 */
export interface SparkNodeFindByTypeResult {
  /** 按深度优先顺序排列的匹配结果数组 */
  matches: SparkNodeFindByTypeMatch[]
  /** 实际命中总数（受 limit 截断前） */
  total: number
}

export type SparkNodeTreeMethodKey =
  | 'getNode'
  | 'getLocation'
  | 'hasNode'
  | 'getParent'
  | 'listChildren'
  | 'countNodes'
  | 'getAllData'
  | 'collectDataKeys'
  | 'collectHandlerNames'
  | 'findByType'
  | 'addNode'
  | 'addNodes'
  | 'moveNode'
  | 'setProps'
  | 'setPropsBatch'
  | 'replaceNode'
  | 'replaceNodes'
  | 'removeNode'
  | 'removeNodes'

// ====================
// 公共 API（SparkNodeTree 编辑模型本体）
// ====================

/**
 * SparkNodeTree
 *
 * 面向单个组件实例（SparkNode）及其子树的结构编辑核心。
 *
 * 这里的 root 表示“当前被编辑的组件实例”。
 * 它既可以是页面组件，也可以是页面中的任意子组件；页面只是递归 SparkNode 模型里的一个更大组件。
 *
 * 在上层设计里，SparkNodeTree 是设计时编辑能力的真实本体：
 * 1. 调用方先查询组件列表，选择合适的组件 type；
 * 2. 再根据组件规格构造一个 SparkNode 节点对象；
 * 3. 最后调用 SparkNodeTree 的公开方法，把该节点写入当前子树，或对已有节点做查询与修改。
 *
 * 因此，这个类提供的不是“组件目录”，而是“树编辑能力集合”。
 * 上层的 tool catalog / function 列表，只是在此基础上做协议投影。
 *
 * 当前公开能力大致可分为四类：
 * 1. 节点查询：getNode / getLocation / hasNode / getParent / listChildren / findByType。
 * 2. 子树统计：countNodes / collectDataKeys / collectHandlerNames。
 * 3. 节点写入：addNode / addNodes / moveNode / replaceNode / replaceNodes / removeNode / removeNodes。
 * 4. 属性写入：setProps / setPropsBatch。
 *
 * 设计目标：
 * 1. 构造时绑定一个当前组件实例，后续所有方法都围绕该组件及其子树工作。
 * 2. 查询类方法不修改当前树状态。
 * 3. 写操作通过不可变重写生成新子树，并回写到实例内部 root。
 * 4. 全部公开方法只接受命名参数对象，不提供位置参数重载。
 */
export class SparkNodeTree {
  private _root: SparkNode
  private readonly _history: SnapshotHistory<SparkNode>
  private _version = -1

  /**
   * 从 JSON 输入创建 SparkNodeTree。
   *
   * - 支持对象或 JSON 字符串输入
   * - 默认会在反序列化过程中补齐缺失组件 id
   */
  static fromJson(
    json: SparkNodeTreeJsonInput,
    options: SparkNodeTreeFromJsonOptions = {},
  ): SparkNodeTree {
    const next = normalizeFromJsonOptions(options)
    const root = normalizeRootFromJsonInput(json, next.fillMissingComponentId)
    return new SparkNodeTree({
      root,
      ...(next.historyLimit !== undefined ? { historyLimit: next.historyLimit } : {}),
    })
  }

  /**
   * 从 rule.json 输入创建页面树。
   *
   * rule.json 可以是：
   * - 单个 SparkNode：作为页面唯一顶层组件
   * - SparkNode[]：作为页面 children
   * - spark-page 根节点：作为完整页面树
   *
   * 进入 SparkNodeTree 后统一为单根 `spark-page`。
   */
  static fromRuleJson(
    json: SparkNodeTreeRuleJsonInput,
    options: SparkNodeTreeFromJsonOptions = {},
  ): SparkNodeTree {
    const next = normalizeFromJsonOptions(options)
    const root = normalizeRuleRootFromJsonInput(json, next.fillMissingComponentId)
    return new SparkNodeTree({
      root,
      ...(next.historyLimit !== undefined ? { historyLimit: next.historyLimit } : {}),
    })
  }

  /**
   * 从页面 children 创建单根页面树。
   */
  static fromPageChildren(
    children: readonly SparkNode[],
    options: SparkNodeTreeFromJsonOptions = {},
  ): SparkNodeTree {
    return SparkNodeTree.fromJson(createSparkPageRoot(children), options)
  }

  /**
   * 使用一个当前组件实例节点创建树操作实例。
   * 构造时自动创建 version 0 作为初始快照。
   */
  constructor(params: SparkNodeTreeRootParams) {
    const next = normalizeRootParams(params, 'constructor')
    this._root = next.root
    const limit = normalizeHistoryLimit(params.historyLimit)
    this._history = new SnapshotHistory<SparkNode>(limit)
    if (limit > 0) {
      this._version++
      this._history.push(this._root)
    }
  }

  /**
   * 当前实例持有的最新组件实例根节点。
   */
  get root(): SparkNode {
    return this._root
  }

  /**
   * 当前版本号（单调递增）。
   */
  get version(): number {
    return Math.max(this._version, 0)
  }

  /**
   * 导出当前组件实例子树快照。
   */
  toJSON(): SparkNode {
    return this._root
  }

  /**
   * 获取当前绑定子树的完整数据快照。
   * 语义上等价于 toJSON()。
   */
  getAllData(): SparkNode {
    return this.toJSON()
  }

  // ─── Undo / Redo（委托 SnapshotHistory）────────────────────────

  /**
   * 是否可撤销。
   */
  get canUndo(): boolean {
    return this._history.canUndo
  }

  /**
   * 是否可重做。
   */
  get canRedo(): boolean {
    return this._history.canRedo
  }

  /**
   * 当前历史游标位置（供 EditTransaction 记录）。
   */
  get historyCursor(): number {
    return this._history.cursor
  }

  /**
   * 撤销最近一次写操作，还原到上一个快照。
   * 返回撤销后的 root；无可撤销时返回 null 不修改状态。
   */
  undo(): SparkNode | null {
    const snapshot = this._history.undo()
    if (snapshot === null) return null
    this._root = snapshot
    return this._root
  }

  /**
   * 重做最近一次被撤销的写操作。
   * 返回重做后的 root；无可重做时返回 null 不修改状态。
   */
  redo(): SparkNode | null {
    const snapshot = this._history.redo()
    if (snapshot === null) return null
    this._root = snapshot
    return this._root
  }

  /**
   * 清空全部历史，仅保留当前快照。
   */
  clearHistory(): void {
    const current = this._history.current
    this._history.clear()
    if (current !== null) {
      this._history.push(current)
    }
  }

  /**
   * 加载新的根节点，替换当前根并以新根作为历史基线重新开始。
   * 清空既有历史栈，等价于 DataSetCrudTool.replaceFromJson。
   */
  loadRoot(newRoot: SparkNode): void {
    const next = normalizeRootParams({ root: newRoot }, 'loadRoot')
    this._root = next.root
    this._history.clear()
    this._version = 0
    this._history.push(this._root)
  }

  /**
   * 替换当前根节点并将变更提交到历史（可 undo/redo）。
   * 用于“文本整体替换”等粗粒度写操作，保留既有历史栈。
   */
  replaceRoot(newRoot: SparkNode): void {
    const next = normalizeRootParams({ root: newRoot }, 'replaceRoot')
    this._commitWrite(next.root, 'replaceRoot')
  }

  // ─── 内部历史管理 ──────────────────────────────────────────────

  /**
   * 写操作确认成功后调用：更新 root 并追加历史快照。
   */
  private _commitWrite(nextRoot: SparkNode, _label: string): void {
    if (isSameSparkNodeSnapshot(this._root, nextRoot)) return
    this._root = nextRoot
    this._version++
    this._history.push(this._root)
  }

  // ─── 查询 / 统计 API：供设计时工具读取、定位目标节点、推导下一步修改策略 ───────────

  /**
   * 按 componentId 查找节点；未命中时返回 null。
   */
  getNode(params: SparkNodeTreeLookupParams): SparkNode | null {
    const next = normalizeLookupParams(params, 'getNode')
    return findLocationRecursive(this._root, next.componentId, null, -1, 0)?.node ?? null
  }

  /**
   * 获取节点在树中的完整位置信息；未命中时返回 null。
   */
  getLocation(params: SparkNodeTreeLookupParams): SparkNodeLocation | null {
    const next = normalizeLookupParams(params, 'getLocation')
    return findLocationRecursive(this._root, next.componentId, null, -1, 0)
  }

  /**
   * 判断指定 componentId 是否存在。
   */
  hasNode(params: SparkNodeTreeLookupParams): boolean {
    return this.getNode(normalizeLookupParams(params, 'hasNode')) !== null
  }

  /**
    * 获取目标节点的直接父节点；当前绑定 root 或未命中时返回 null。
   */
  getParent(params: SparkNodeTreeLookupParams): SparkNode | null {
    return this.getLocation(normalizeLookupParams(params, 'getParent'))?.parent ?? null
  }

  /**
   * 读取当前组件实例或指定子组件的直接 children。
   *
   * 返回的是 children 的浅拷贝，避免调用方直接改写实例内部数组引用。
   */
  listChildren(params: SparkNodeTreeChildrenParams = {}): SparkNodeChildren {
    const next = normalizeChildrenParams(params, 'listChildren')
    const parent = resolveParentNode(this._root, next.parentComponentId)
    return [...(parent.children ?? [])]
  }

  /**
   * 统计当前组件实例子树中的结构节点数量。
   */
  countNodes(): number {
    return countRecursive(this._root)
  }

  /**
   * 收集当前组件实例子树中出现过的全部唯一 dataKey。
   */
  collectDataKeys(): Set<string> {
    const keys = new Set<string>()
    collectDataKeysRecursive(this._root, keys)
    return keys
  }

  /**
   * 收集当前组件实例子树中 props.on 里声明过的全部唯一处理器名。
   */
  collectHandlerNames(): Set<string> {
    const handlers = new Set<string>()
    collectHandlerNamesRecursive(this._root, handlers)
    return handlers
  }

  // ─── 写入 API：供设计时工具把新 SparkNode 写入树中，或修改既有节点结构 / 属性 ─────────

  /**
   * 按组件类型名递归搜索子树，返回所有匹配节点的真实 id、深度和父 id。
   *
   * 典型用法：当调用方知道目标组件类型（如 'r-tabs'）但不知道其节点 id 时，
   * 调用此方法可一步获取可直接用于 getNode / setProps / removeNode 的真实 id。
   */
  findByType(params: SparkNodeFindByTypeParams): SparkNodeFindByTypeResult {
    const next = normalizeFindByTypeParams(params)
    const startNode = next.startComponentId !== undefined
      ? requireLocation(this._root, next.startComponentId).node
      : this._root
    const allMatches: SparkNodeFindByTypeMatch[] = []
    findByTypeRecursive(startNode, next.type, null, 0, allMatches)
    const total = allMatches.length
    const matches = next.limit !== undefined ? allMatches.slice(0, next.limit) : allMatches
    return { matches, total }
  }

  /**
   * 向当前组件实例或指定子组件的 children 中添加一个新节点。
   *
   * 这是“先构造 SparkNode，再放入 SparkNodeTree”这条链路的最直接入口。
   */
  addNode(params: SparkNodeTreeAddParams): SparkNodeAddResult {
    const next = normalizeAddParams(params)
    const operation = applyAddNode(this._root, next)
    this._commitWrite(operation.nextRoot, 'addNode')
    return operation.result
  }

  /**
   * 向同一个子组件容器批量插入多个新节点。
   *
   * - nodes 按传入顺序依次插入
   * - index 省略时整体追加到末尾
   * - index 提供时，从该位置开始连续插入
   */
  addNodes(params: SparkNodeTreeAddNodesParams): SparkNodeAddNodesResult {
    const next = normalizeAddNodesParams(params)
    let workingRoot = this._root
    let nextIndex = next.index
    const indexes: number[] = []

    for (const node of next.nodes) {
      const operation = applyAddNode(workingRoot, {
        node,
        ...(next.parentComponentId !== undefined ? { parentComponentId: next.parentComponentId } : {}),
        ...(nextIndex !== undefined ? { index: nextIndex } : {}),
      })
      workingRoot = operation.nextRoot
      indexes.push(operation.result.index)
      if (nextIndex !== undefined) {
        nextIndex = operation.result.index + 1
      }
    }

    this._commitWrite(workingRoot, 'addNodes')
    return {
      nodes: [...next.nodes],
      indexes,
    }
  }

  /**
   * 把已有节点移动到当前组件实例或指定子组件的 children 中。
   *
   * 返回值只包含移动摘要，不回传完整节点子树，避免结果膨胀。
   */
  moveNode(params: SparkNodeTreeMoveParams): SparkNodeMoveResult {
    const next = normalizeMoveParams(params)
    const operation = applyMoveNode(this._root, next)
    this._commitWrite(operation.nextRoot, 'moveNode')
    return operation.result
  }

  /**
   * 设置目标节点的 props。
   *
   * - merge !== false 时，采用浅合并语义
   * - merge === false 时，直接替换整个 props 对象
   *
   * 这类方法承载的是“修改属性值”能力，而不是组件选择能力。
   */
  setProps(params: SparkNodeTreeSetPropsParams): SparkNodeSetPropsResult {
    const next = normalizeSetPropsParams(params)
    const operation = applySetProps(this._root, next)
    this._commitWrite(operation.nextRoot, 'setProps')
    return operation.result
  }

  /**
   * 批量设置多个节点的 props。
   */
  setPropsBatch(params: SparkNodeTreeSetPropsBatchParams): SparkNodeSetPropsBatchResult {
    const next = normalizeSetPropsBatchParams(params)
    let workingRoot = this._root
    const nodes: SparkNode[] = []

    for (const item of next.items) {
      const operation = applySetProps(workingRoot, item)
      workingRoot = operation.nextRoot
      nodes.push(operation.result.node)
    }

    this._commitWrite(workingRoot, 'setPropsBatch')
    return { nodes }
  }

  /**
   * 用一个新的 SparkNode 完整替换目标节点。
   *
   * 这类方法承载的是“修改节点结构”能力：节点 type、props、children 都可以整体替换。
   */
  replaceNode(params: SparkNodeTreeReplaceParams): SparkNodeReplaceResult {
    const next = normalizeReplaceParams(params)
    const operation = applyReplaceNode(this._root, next)
    this._commitWrite(operation.nextRoot, 'replaceNode')
    return operation.result
  }

  /**
   * 批量替换多个节点。
   */
  replaceNodes(params: SparkNodeTreeReplaceNodesParams): SparkNodeReplaceNodesResult {
    const next = normalizeReplaceNodesParams(params)
    let workingRoot = this._root
    const items: SparkNodeReplaceResult[] = []

    for (const item of next.items) {
      const operation = applyReplaceNode(workingRoot, item)
      workingRoot = operation.nextRoot
      items.push(operation.result)
    }

    this._commitWrite(workingRoot, 'replaceNodes')
    return { items }
  }

  /**
   * 删除当前组件实例子树内的指定节点。
   *
   * 当前绑定的 root 自身不允许删除；调用方如果要整体替换当前组件实例，应直接创建新的实例或重建 root。
   */
  removeNode(params: SparkNodeTreeRemoveParams): SparkNodeRemoveResult {
    const next = normalizeRemoveParams(params)
    const operation = applyRemoveNode(this._root, next)
    this._commitWrite(operation.nextRoot, 'removeNode')
    return operation.result
  }

  /**
   * 批量删除多个节点。
   */
  removeNodes(params: SparkNodeTreeRemoveNodesParams): SparkNodeRemoveNodesResult {
    const next = normalizeRemoveNodesParams(params)
    let workingRoot = this._root
    const items: SparkNodeRemoveResult[] = []

    for (const componentId of next.componentIds) {
      const operation = applyRemoveNode(workingRoot, { componentId })
      workingRoot = operation.nextRoot
      items.push(operation.result)
    }

    this._commitWrite(workingRoot, 'removeNodes')
    return { items }
  }

}

// ====================
// 内部辅助类型
// ====================

/**
 * 路径重写的内部返回结构。
 */
interface NodeRewriteResult<TResult> {
  next: SparkNode | null
  changed: boolean
  result: TResult | null
}

// ====================
// 内部参数归一化
// ====================

const DEFAULT_HISTORY_LIMIT = 50

/**
 * 归一化 historyLimit 参数。
 */
function normalizeHistoryLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_HISTORY_LIMIT
  if (!Number.isInteger(value) || value < 0) return DEFAULT_HISTORY_LIMIT
  return value
}

/**
 * 归一化构造参数。
 */
function normalizeRootParams(
  params: SparkNodeTreeRootParams,
  methodName: string,
): SparkNodeTreeRootParams {
  const next = requireObjectArg(params, `${methodName}.params`)
  return {
    root: requireSparkNode(next.root, `${methodName}.root`),
  }
}

/**
 * 归一化 fromJson 选项。
 */
function normalizeFromJsonOptions(
  options: SparkNodeTreeFromJsonOptions,
): Required<Pick<SparkNodeTreeFromJsonOptions, 'fillMissingComponentId'>> & Pick<SparkNodeTreeFromJsonOptions, 'historyLimit'> {
  const next = requireObjectArg(options, 'fromJson.options')
  if (next.fillMissingComponentId !== undefined && typeof next.fillMissingComponentId !== 'boolean') {
    throw new Error('fromJson.options.fillMissingComponentId must be a boolean')
  }
  if (next.historyLimit !== undefined && (!Number.isInteger(next.historyLimit) || next.historyLimit < 0)) {
    throw new Error('fromJson.options.historyLimit must be a non-negative integer')
  }

  return {
    fillMissingComponentId: next.fillMissingComponentId ?? true,
    ...(next.historyLimit !== undefined ? { historyLimit: next.historyLimit } : {}),
  }
}

/**
 * 归一化 nodeId 查询参数。
 */
function normalizeLookupParams(
  params: SparkNodeTreeLookupParams,
  methodName: string,
): SparkNodeTreeLookupParams {
  const next = requireObjectArg(params, `${methodName}.params`)
  return {
    componentId: requireNonEmptyString(next.componentId, `${methodName}.componentId`),
  }
}

/**
 * 归一化 children 选择参数。
 */
function normalizeChildrenParams(
  params: SparkNodeTreeChildrenParams,
  methodName: string,
): SparkNodeTreeChildrenParams {
  const next = requireObjectArg(params, `${methodName}.params`)
  if (next.parentComponentId === undefined) {
    return {}
  }

  const parentComponentId = normalizeOptionalNodeId(next.parentComponentId, `${methodName}.parentComponentId`)
  return parentComponentId === undefined ? {} : { parentComponentId }
}

/**
 * 归一化 addNode 输入参数。
 */
function normalizeAddParams(params: SparkNodeTreeAddParams): SparkNodeTreeAddParams {
  const next = requireObjectArg(params, 'addNode.params')
  if (next.index !== undefined) {
    assertNonNegativeInteger(next.index, 'addNode.index')
  }

  const parentComponentId = next.parentComponentId === undefined
    ? undefined
    : normalizeOptionalNodeId(next.parentComponentId, 'addNode.parentComponentId')

  return {
    node: requireSparkNode(next.node, 'addNode.node'),
    ...(parentComponentId !== undefined ? { parentComponentId } : {}),
    ...(next.index !== undefined ? { index: next.index } : {}),
  }
}

/**
 * 归一化 addNodes 输入参数。
 */
function normalizeAddNodesParams(params: SparkNodeTreeAddNodesParams): SparkNodeTreeAddNodesParams {
  const next = requireObjectArg(params, 'addNodes.params')
  if (next.index !== undefined) {
    assertNonNegativeInteger(next.index, 'addNodes.index')
  }

  const parentComponentId = next.parentComponentId === undefined
    ? undefined
    : normalizeOptionalNodeId(next.parentComponentId, 'addNodes.parentComponentId')

  return {
    nodes: requireNonEmptySparkNodeArray(next.nodes, 'addNodes.nodes'),
    ...(parentComponentId !== undefined ? { parentComponentId } : {}),
    ...(next.index !== undefined ? { index: next.index } : {}),
  }
}

/**
 * 归一化 moveNode 输入参数。
 */
function normalizeMoveParams(params: SparkNodeTreeMoveParams): SparkNodeTreeMoveParams {
  const next = requireObjectArg(params, 'moveNode.params')
  if (next.index !== undefined) {
    assertNonNegativeInteger(next.index, 'moveNode.index')
  }

  const parentComponentId = next.parentComponentId === undefined
    ? undefined
    : normalizeOptionalNodeId(next.parentComponentId, 'moveNode.parentComponentId')

  return {
    componentId: requireNonEmptyString(next.componentId, 'moveNode.componentId'),
    ...(parentComponentId !== undefined ? { parentComponentId } : {}),
    ...(next.index !== undefined ? { index: next.index } : {}),
  }
}

/**
 * 归一化 setProps 输入参数。
 */
function normalizeSetPropsParams(params: SparkNodeTreeSetPropsParams): SparkNodeTreeSetPropsParams {
  const next = requireObjectArg(params, 'setProps.params')
  return {
    componentId: requireNonEmptyString(next.componentId, 'setProps.componentId'),
    props: requireRecord(next.props, 'setProps.props'),
    ...(next.merge !== undefined ? { merge: next.merge } : {}),
  }
}

/**
 * 归一化 setPropsBatch 输入参数。
 */
function normalizeSetPropsBatchParams(
  params: SparkNodeTreeSetPropsBatchParams,
): SparkNodeTreeSetPropsBatchParams {
  const next = requireObjectArg(params, 'setPropsBatch.params')
  const items = requireObjectArray(next.items, 'setPropsBatch.items').map((item, index) => {
    return {
      componentId: requireNonEmptyString(
        typeof item['componentId'] === 'string' ? item['componentId'] : undefined,
        `setPropsBatch.items[${index}].componentId`,
      ),
      props: requireRecord(item['props'], `setPropsBatch.items[${index}].props`),
      ...(item['merge'] !== undefined ? { merge: item['merge'] as boolean } : {}),
    }
  })
  assertUniqueNodeIds(items.map((item) => item.componentId), 'setPropsBatch.items')
  return { items }
}

/**
 * 归一化 replaceNode 输入参数。
 */
function normalizeReplaceParams(params: SparkNodeTreeReplaceParams): SparkNodeTreeReplaceParams {
  const next = requireObjectArg(params, 'replaceNode.params')
  return {
    componentId: requireNonEmptyString(next.componentId, 'replaceNode.componentId'),
    node: requireSparkNode(next.node, 'replaceNode.node'),
  }
}

/**
 * 归一化 replaceNodes 输入参数。
 */
function normalizeReplaceNodesParams(
  params: SparkNodeTreeReplaceNodesParams,
): SparkNodeTreeReplaceNodesParams {
  const next = requireObjectArg(params, 'replaceNodes.params')
  const items = requireObjectArray(next.items, 'replaceNodes.items').map((item, index) => {
    return {
      componentId: requireNonEmptyString(
        typeof item['componentId'] === 'string' ? item['componentId'] : undefined,
        `replaceNodes.items[${index}].componentId`,
      ),
      node: requireSparkNode(item['node'], `replaceNodes.items[${index}].node`),
    }
  })
  assertUniqueNodeIds(items.map((item) => item.componentId), 'replaceNodes.items')
  return { items }
}

/**
 * 归一化 removeNode 输入参数。
 */
function normalizeRemoveParams(params: SparkNodeTreeRemoveParams): SparkNodeTreeRemoveParams {
  return normalizeLookupParams(params, 'removeNode')
}

/**
 * 归一化 removeNodes 输入参数。
 */
function normalizeRemoveNodesParams(
  params: SparkNodeTreeRemoveNodesParams,
): SparkNodeTreeRemoveNodesParams {
  const next = requireObjectArg(params, 'removeNodes.params')
  const componentIds = requireNonEmptyStringArray(next.componentIds, 'removeNodes.componentIds')
  assertUniqueNodeIds(componentIds, 'removeNodes.componentIds')
  return { componentIds }
}

// ====================
// 内部辅助方法
// ====================

const KEEP = Symbol('spark-node-tree:keep')

type KeepValue = typeof KEEP

/**
 * 断言字符串参数是非空字符串，并返回收窄后的值。
 */
function requireNonEmptyString(value: string | undefined, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }
  return value
}

/**
 * 断言输入是对象参数。
 */
function requireObjectArg<T>(value: T, fieldName: string): Exclude<T, undefined> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`)
  }
  return value as Exclude<T, undefined>
}

/**
 * 断言输入至少是一个像 SparkNode 的对象。
 */
function assertNodeLike(node: unknown, fieldName: string): asserts node is SparkNode {
  if (typeof node !== 'object' || node === null) {
    throw new Error(`${fieldName} must be a SparkNode with a non-empty type`)
  }

  const candidate = node as { type?: unknown }
  if (typeof candidate.type !== 'string' || candidate.type.length === 0) {
    throw new Error(`${fieldName} must be a SparkNode with a non-empty type`)
  }
}

/**
 * 断言并返回 SparkNode。
 */
function requireSparkNode(value: unknown, fieldName: string): SparkNode {
  assertNodeLike(value, fieldName)
  return normalizeSparkNode(value)
}

/**
 * 断言输入是可作为 props 使用的对象记录。
 */
function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`)
  }
  return value as Record<string, unknown>
}

/**
 * 归一化可选节点 ID。
 */
function normalizeOptionalNodeId(
  value: string | null | undefined,
  fieldName: string,
): string | null | undefined {
  if (value === null || value === undefined) {
    return value
  }
  return requireNonEmptyString(value, fieldName)
}

/**
 * 断言数值是非负整数。
 */
function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`)
  }
}

/**
 * 断言 childIds 是非空字符串数组。
 */
function requireNonEmptyStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array`)
  }

  return value.map((entry, index) => requireNonEmptyString(
    typeof entry === 'string' ? entry : undefined,
    `${fieldName}[${index}]`,
  ))
}

/**
 * 断言输入是对象数组。
 */
function requireObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array`)
  }

  return value.map((entry, index) => requireRecord(entry, `${fieldName}[${index}]`))
}

/**
 * 断言输入是 SparkNode 数组。
 */
function requireNonEmptySparkNodeArray(value: unknown, fieldName: string): SparkNode[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array`)
  }

  return value.map((entry, index) => requireSparkNode(entry, `${fieldName}[${index}]`))
}

/**
 * 断言 nodeId 列表中不存在重复项。
 */
function assertUniqueNodeIds(nodeIds: string[], fieldName: string): void {
  const seen = new Set<string>()
  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) {
      throw new Error(`Duplicate node id "${nodeId}" in ${fieldName}`)
    }
    seen.add(nodeId)
  }
}

/**
 * 计算插入位置。
 */
function clampInsertIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length
  return Math.min(index, length)
}

/**
 * 以最小字段集构造 SparkNode。
 */
function buildSparkNode(params: {
  type: string
  id?: string
  props?: Record<string, unknown>
  children?: SparkNodeChildren
}): SparkNode {
  const normalizedId = typeof params.id === 'string' ? params.id : undefined

  return {
    type: params.type,
    ...(normalizedId !== undefined ? { id: normalizedId } : {}),
    ...(params.props !== undefined ? { props: params.props } : {}),
    ...(params.children !== undefined ? { children: params.children } : {}),
  }
}

/**
 * 基于旧节点复制出一个新节点，并允许对部分字段做定点替换。
 */
function copySparkNode(
  node: SparkNode,
  nextType: string | KeepValue = KEEP,
  nextProps: Record<string, unknown> | undefined | KeepValue = KEEP,
  nextChildren: SparkNodeChildren | undefined | KeepValue = KEEP,
): SparkNode {
  const type = nextType === KEEP ? node.type : nextType
  const props = nextProps === KEEP ? node.props : nextProps
  const children = nextChildren === KEEP ? node.children : nextChildren
  const nextId = readNodeId(node)

  return buildSparkNode({
    type,
    ...(nextId !== undefined ? { id: nextId } : {}),
    ...(props !== undefined ? { props } : {}),
    ...(children !== undefined ? { children } : {}),
  })
}

/**
 * 递归查找 nodeId 对应的位置信息。
 */
function findLocationRecursive(
  current: SparkNode,
  nodeId: string,
  parent: SparkNode | null,
  index: number,
  depth: number,
): SparkNodeLocation | null {
  if (readNodeId(current) === nodeId) {
    return { node: current, parent, index, depth }
  }

  if (!Array.isArray(current.children) || current.children.length === 0) return null

  for (let childIndex = 0; childIndex < current.children.length; childIndex += 1) {
    const child = current.children[childIndex]
    if (!isSparkNode(child)) continue
    const found = findLocationRecursive(child, nodeId, current, childIndex, depth + 1)
    if (found !== null) return found
  }

  return null
}

/**
 * 强制要求某个节点存在；不存在时立即 fail-fast。
 */
function requireLocation(root: SparkNode, nodeId: string): SparkNodeLocation {
  const location = findLocationRecursive(root, nodeId, null, -1, 0)
  if (location === null) {
    throw new Error(`Node "${nodeId}" not found`)
  }
  return location
}

/**
 * 解析 parentId 对应的父节点。
 */
function resolveParentNode(root: SparkNode, parentId: string | null | undefined): SparkNode {
  if (parentId === null || parentId === undefined) return root
  return requireLocation(root, parentId).node
}

/**
 * 递归收集类型匹配的所有节点，结果按深度优先顺序追加到 out 数组。
 */
function findByTypeRecursive(
  current: SparkNode,
  targetType: string,
  parentId: string | null | undefined,
  depth: number,
  out: SparkNodeFindByTypeMatch[],
): void {
  if (current.type === targetType) {
    out.push({
      id: readNodeId(current),
      type: current.type,
      depth,
      parentId,
    })
  }

  if (!Array.isArray(current.children) || current.children.length === 0) return

  const currentId = readNodeId(current)
  for (const child of current.children) {
    if (!isSparkNode(child)) continue
    findByTypeRecursive(child, targetType, currentId, depth + 1, out)
  }
}

/**
 * 归一化 findByType 输入参数。
 */
function normalizeFindByTypeParams(params: SparkNodeFindByTypeParams): SparkNodeFindByTypeParams {
  const next = requireObjectArg(params, 'findByType.params')
  const type = requireNonEmptyString(
    typeof next.type === 'string' ? next.type : undefined,
    'findByType.type',
  )

  const startComponentId = next.startComponentId === undefined
    ? undefined
    : requireNonEmptyString(
        typeof next.startComponentId === 'string' ? next.startComponentId : undefined,
        'findByType.startComponentId',
      )

  if (next.limit !== undefined) {
    assertNonNegativeInteger(next.limit, 'findByType.limit')
  }

  return {
    type,
    ...(startComponentId !== undefined ? { startComponentId } : {}),
    ...(next.limit !== undefined ? { limit: next.limit } : {}),
  }
}

/**
 * 归一化 fromJson 输入，并按需补齐缺失组件 id。
 */
function normalizeRootFromJsonInput(
  json: SparkNodeTreeJsonInput,
  fillMissingComponentId: boolean,
): SparkNode {
  const parsed = parseSparkNodeJsonInput(json)
  const root = requireSparkNode(parsed, 'fromJson.root')
  return normalizeSparkNodeWithComponentIds(root, fillMissingComponentId)
}

function normalizeRuleRootFromJsonInput(
  json: SparkNodeTreeRuleJsonInput,
  fillMissingComponentId: boolean,
): SparkNode {
  const parsed = parseSparkNodeJsonInput(json)
  if (Array.isArray(parsed)) {
    return normalizeSparkNodeWithComponentIds(createSparkPageRoot(requireRuleChildren(parsed)), fillMissingComponentId)
  }
  if (!isSparkNode(parsed)) {
    throw new Error('rule.json 顶层必须是 SparkNode 或 SparkNode[]')
  }

  const normalized = requireSparkNode(parsed, 'rule.json.root')
  if (normalized.type === SPARK_PAGE_NODE_TYPE) {
    return normalizeSparkNodeWithComponentIds(normalizeSparkPageRoot(normalized), fillMissingComponentId)
  }
  return normalizeSparkNodeWithComponentIds(createSparkPageRoot([normalized]), fillMissingComponentId)
}

function normalizeSparkPageRoot(root: SparkNode): SparkNode {
  const children = Array.isArray(root.children) ? requireRuleChildren(root.children) : []
  return {
    ...root,
    id: readNodeId(root) ?? SPARK_PAGE_ROOT_ID,
    children,
  }
}

function requireRuleChildren(children: readonly unknown[]): SparkNode[] {
  return children.map((child, index) => {
    if (!isSparkNode(child)) {
      throw new Error(`rule.json 节点必须是 SparkNode：第 ${index} 项需要非空字符串 type`)
    }
    return requireSparkNode(child, `rule.json[${index}]`)
  })
}

/**
 * 解析 SparkNode JSON 输入。
 */
function parseSparkNodeJsonInput(json: SparkNodeTreeJsonInput | SparkNodeTreeRuleJsonInput): unknown {
  if (typeof json !== 'string') return json
  const trimmed = json.trim()
  if (trimmed.length === 0) {
    throw new Error('fromJson.json must not be an empty string')
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    throw new Error('fromJson.json must be valid JSON')
  }
}

/**
 * 递归归一化整棵节点树，并按需补齐缺失组件 id。
 */
function normalizeSparkNodeWithComponentIds(root: SparkNode, fillMissingComponentId: boolean): SparkNode {
  const usedIds = new Set<string>()
  return normalizeSparkNodeWithComponentIdsRecursive(root, fillMissingComponentId, usedIds, [0])
}

function normalizeSparkNodeWithComponentIdsRecursive(
  node: SparkNode,
  fillMissingComponentId: boolean,
  usedIds: Set<string>,
  path: number[],
): SparkNode {
  const normalized = normalizeSparkNode(node)
  const source = node as unknown as Record<string, unknown>

  const rawChildren = Array.isArray(source['children'])
    ? (source['children'] as unknown[])
    : (Array.isArray(normalized.children) ? normalized.children : [])

  const children = rawChildren.map((child, index) => {
    if (!isSparkNode(child)) return child
    return normalizeSparkNodeWithComponentIdsRecursive(child, fillMissingComponentId, usedIds, [...path, index])
  })

  let componentId = readNodeId(normalized)
  if (componentId === undefined && fillMissingComponentId) {
    componentId = generateAutoComponentId(normalized.type, path)
  }

  if (componentId !== undefined) {
    if (usedIds.has(componentId)) {
      throw new Error(`fromJson.componentId duplicated: ${componentId}`)
    }
    usedIds.add(componentId)
  }

  const nextProps = normalized.props !== undefined ? { ...normalized.props } : undefined

  const nextNode: Record<string, unknown> = {
    type: normalized.type,
    children,
  }

  if (componentId !== undefined) {
    nextNode['id'] = componentId
  }

  if (nextProps !== undefined && Object.keys(nextProps).length > 0) {
    nextNode['props'] = nextProps
  } else {
    delete nextNode['props']
  }

  return nextNode as unknown as SparkNode
}

function generateAutoComponentId(type: string, path: number[]): string {
  const safeType = type.replace(/[^a-zA-Z0-9_-]/g, '-') || 'node'
  return `${safeType}__${path.join('_')}`
}

/**
 * 对 addNode 做一次不可变写入，返回新 root 与动作结果。
 */
function applyAddNode(
  root: SparkNode,
  params: SparkNodeTreeAddParams,
): { nextRoot: SparkNode; result: SparkNodeAddResult } {
  const parent = resolveParentNode(root, params.parentComponentId)
  const currentChildren = parent.children ?? []
  const index = clampInsertIndex(params.index, currentChildren.length)
  const nextChildren = [...currentChildren]
  nextChildren.splice(index, 0, params.node)

  if (params.parentComponentId === null || params.parentComponentId === undefined) {
    return {
      nextRoot: copySparkNode(root, KEEP, KEEP, nextChildren),
      result: {
        node: params.node,
        index,
      },
    }
  }

  const rewritten = rewriteNodeById(root, params.parentComponentId, (location) => ({
    nextNode: copySparkNode(location.node, KEEP, KEEP, nextChildren),
    result: {
      node: params.node,
      index,
    },
  }))
  const { next, result } = assertRewriteSucceeded(rewritten, 'addNode')
  return {
    nextRoot: next,
    result,
  }
}

/**
 * 对 moveNode 做一次不可变写入。
 */
function applyMoveNode(
  root: SparkNode,
  params: SparkNodeTreeMoveParams,
): { nextRoot: SparkNode; result: SparkNodeMoveResult } {
  const location = requireLocation(root, params.componentId)
  if (location.parent === null) {
    throw new Error('Cannot move root node')
  }

  if (params.parentComponentId !== null && params.parentComponentId !== undefined) {
    if (findLocationRecursive(location.node, params.parentComponentId, null, -1, 0) !== null) {
      throw new Error('Cannot move node into itself or descendant')
    }
    requireLocation(root, params.parentComponentId)
  }

  const removed = applyRemoveNode(root, { componentId: params.componentId })
  const added = applyAddNode(removed.nextRoot, {
    node: removed.result.removed,
    ...(params.parentComponentId !== undefined ? { parentComponentId: params.parentComponentId } : {}),
    ...(params.index !== undefined ? { index: params.index } : {}),
  })

  return {
    nextRoot: added.nextRoot,
    result: {
      componentId: params.componentId,
      fromParentComponentId: readNodeId(location.parent) ?? null,
      toParentComponentId: params.parentComponentId ?? null,
      previousIndex: location.index,
      index: added.result.index,
    },
  }
}

/**
 * 对 setProps 做一次不可变写入。
 */
function applySetProps(
  root: SparkNode,
  params: SparkNodeTreeSetPropsParams,
): { nextRoot: SparkNode; result: SparkNodeSetPropsResult } {
  const location = requireLocation(root, params.componentId)
  const nextProps = params.merge === false
    ? { ...params.props }
    : { ...(location.node.props ?? {}), ...params.props }

  const rewritten = rewriteNodeById(root, params.componentId, (currentLocation) => {
    const nextNode = copySparkNode(currentLocation.node, KEEP, nextProps)
    return {
      nextNode,
      result: {
        node: nextNode,
      },
    }
  })

  const { next, result } = assertRewriteSucceeded(rewritten, 'setProps')
  return {
    nextRoot: next,
    result,
  }
}

/**
 * 对 replaceNode 做一次不可变写入。
 */
function applyReplaceNode(
  root: SparkNode,
  params: SparkNodeTreeReplaceParams,
): { nextRoot: SparkNode; result: SparkNodeReplaceResult } {
  const previous = requireLocation(root, params.componentId).node

  const rewritten = rewriteNodeById(root, params.componentId, () => ({
    nextNode: params.node,
    result: {
      node: params.node,
      previous,
    },
  }))

  const { next, result } = assertRewriteSucceeded(rewritten, 'replaceNode')
  return {
    nextRoot: next,
    result,
  }
}

/**
 * 对 removeNode 做一次不可变写入。
 */
function applyRemoveNode(
  root: SparkNode,
  params: SparkNodeTreeRemoveParams,
): { nextRoot: SparkNode; result: SparkNodeRemoveResult } {
  const location = requireLocation(root, params.componentId)
  if (location.parent === null) {
    throw new Error('Cannot remove root node')
  }

  const rewritten = rewriteNodeById(root, params.componentId, (currentLocation) => ({
    nextNode: null,
    result: {
      removed: currentLocation.node,
      index: location.index,
    },
  }))

  const { next, result } = assertRewriteSucceeded(rewritten, 'removeNode')
  return {
    nextRoot: next,
    result,
  }
}

/**
 * 按 nodeId 对树做路径级不可变重写。
 */
function rewriteNodeById<TResult>(
  current: SparkNode,
  nodeId: string,
  updater: (location: SparkNodeLocation) => { nextNode: SparkNode | null; result: TResult },
  parent: SparkNode | null = null,
  index = -1,
  depth = 0,
): NodeRewriteResult<TResult> {
  if (readNodeId(current) === nodeId) {
    const updated = updater({ node: current, parent, index, depth })
    return {
      next: updated.nextNode,
      changed: true,
      result: updated.result,
    }
  }

  if (!Array.isArray(current.children) || current.children.length === 0) {
    return { next: current, changed: false, result: null }
  }

  let changed = false
  let result: TResult | null = null
  const nextChildren: SparkNodeChildren = []

  for (let childIndex = 0; childIndex < current.children.length; childIndex += 1) {
    const child = current.children[childIndex]
    if (child === undefined) continue
    if (!isSparkNode(child)) {
      nextChildren.push(child)
      continue
    }

    const childResult = rewriteNodeById(child, nodeId, updater, current, childIndex, depth + 1)
    if (!childResult.changed) {
      nextChildren.push(child)
      continue
    }

    changed = true
    result = childResult.result
    if (childResult.next !== null) {
      nextChildren.push(childResult.next)
    }
  }

  if (!changed) {
    return { next: current, changed: false, result: null }
  }

  return {
    next: copySparkNode(current, KEEP, KEEP, nextChildren),
    changed: true,
    result,
  }
}

/**
 * 递归统计结构节点数量。
 */
function countRecursive(node: SparkNode): number {
  let count = 1
  if (!Array.isArray(node.children)) return count
  for (const child of node.children) {
    if (isSparkNode(child)) count += countRecursive(child)
  }
  return count
}

/**
 * 递归收集所有 props.dataKey。
 */
function collectDataKeysRecursive(node: SparkNode, out: Set<string>): void {
  const dataKey = node.props?.['dataKey']
  if (typeof dataKey === 'string' && dataKey.length > 0) {
    out.add(dataKey)
  }
  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    if (isSparkNode(child)) collectDataKeysRecursive(child, out)
  }
}

/**
 * 递归收集所有 props.on 中声明的处理器名。
 */
function collectHandlerNamesRecursive(node: SparkNode, out: Set<string>): void {
  const on = node.props?.['on']
  if (on !== null && typeof on === 'object') {
    for (const handler of Object.values(on as Record<string, unknown>)) {
      if (typeof handler === 'string' && handler.length > 0) {
        out.add(handler)
      }
    }
  }
  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    if (isSparkNode(child)) collectHandlerNamesRecursive(child, out)
  }
}

/**
 * 把内部 rewrite 结果收口成对外安全可用的成功结果。
 */
function assertRewriteSucceeded<TResult>(
  rewriteResult: NodeRewriteResult<TResult>,
  action: string,
): { next: SparkNode; result: TResult } {
  if (!rewriteResult.changed || rewriteResult.next === null || rewriteResult.result === null) {
    throw new Error(`SparkNodeTree.${action} failed unexpectedly`)
  }
  return {
    next: rewriteResult.next,
    result: rewriteResult.result,
  }
}
