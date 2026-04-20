import { isSparkNode, nodeId as readNodeId, type SparkNode, type SparkNodeChildren } from './types.js'
import { SnapshotHistory } from '@spark-view/spark-utils'

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
 * 需要按 nodeId 查找节点时使用的参数。
 */
export interface SparkNodeTreeLookupParams {
  nodeId: string
}

/**
 * 需要定位某个父节点 children 时使用的参数。
 */
export interface SparkNodeTreeChildrenParams {
  parentId?: string | null
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
  nodeIds: string[]
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

// ====================
// 公共 API（SparkNodeTree FC 本体）
// ====================

/**
 * SparkNodeTree
 *
 * 面向单个组件实例（SparkNode）及其子树的结构编辑核心。
 *
 * 这里的 root 表示“当前被编辑的组件实例”。
 * 它既可以是页面组件，也可以是页面中的任意子组件；页面只是递归 SparkNode 模型里的一个更大组件。
 *
 * 在上层设计里，SparkNodeTree 可以视为一组 FC（Function Calling）能力的真实本体：
 * 1. LLM 先查询组件列表，选择合适的组件 type；
 * 2. 再根据组件规格构造一个 SparkNode 节点对象；
 * 3. 最后调用 SparkNodeTree 的公开方法，把该节点写入当前子树，或对已有节点做查询与修改。
 *
 * 因此，这个类提供的不是“组件目录”，而是“树编辑能力集合”。
 * 上层的 tool catalog / stills / FC 列表，只是在此基础上做协议投影。
 *
 * 当前公开能力大致可分为四类：
 * 1. 节点查询：getNode / getLocation / hasNode / getParent / listChildren。
 * 2. 子树统计：countNodes / collectDataKeys / collectHandlerNames。
 * 3. 节点写入：addNode / addNodes / replaceNode / replaceNodes / removeNode / removeNodes。
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

  // ─── 内部历史管理 ──────────────────────────────────────────────

  /**
   * 写操作确认成功后调用：更新 root 并追加历史快照。
   */
  private _commitWrite(nextRoot: SparkNode, _label: string): void {
    this._root = nextRoot
    this._version++
    this._history.push(this._root)
  }

  // ─── 查询 / 统计 API：供 FC 做读操作、定位目标节点、推导下一步修改策略 ───────────

  /**
   * 按 nodeId 查找节点；未命中时返回 null。
   */
  getNode(params: SparkNodeTreeLookupParams): SparkNode | null {
    const next = normalizeLookupParams(params, 'getNode')
    return findLocationRecursive(this._root, next.nodeId, null, -1, 0)?.node ?? null
  }

  /**
   * 获取节点在树中的完整位置信息；未命中时返回 null。
   */
  getLocation(params: SparkNodeTreeLookupParams): SparkNodeLocation | null {
    const next = normalizeLookupParams(params, 'getLocation')
    return findLocationRecursive(this._root, next.nodeId, null, -1, 0)
  }

  /**
   * 判断指定 nodeId 是否存在。
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
    const parent = resolveParentNode(this._root, next.parentId)
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

  // ─── 写入 API：供 FC 把新 SparkNode 写入树中，或修改既有节点结构 / 属性 ─────────

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
        ...(next.parentId !== undefined ? { parentId: next.parentId } : {}),
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

    for (const nodeId of next.nodeIds) {
      const operation = applyRemoveNode(workingRoot, { nodeId })
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
 * 归一化 nodeId 查询参数。
 */
function normalizeLookupParams(
  params: SparkNodeTreeLookupParams,
  methodName: string,
): SparkNodeTreeLookupParams {
  const next = requireObjectArg(params, `${methodName}.params`)
  return {
    nodeId: requireNonEmptyString(next.nodeId, `${methodName}.nodeId`),
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
  if (next.parentId === undefined) {
    return {}
  }

  const parentId = normalizeOptionalNodeId(next.parentId, `${methodName}.parentId`)
  return parentId === undefined ? {} : { parentId }
}

/**
 * 归一化 addNode 输入参数。
 */
function normalizeAddParams(params: SparkNodeTreeAddParams): SparkNodeTreeAddParams {
  const next = requireObjectArg(params, 'addNode.params')
  if (next.index !== undefined) {
    assertNonNegativeInteger(next.index, 'addNode.index')
  }

  const parentId = next.parentId === undefined
    ? undefined
    : normalizeOptionalNodeId(next.parentId, 'addNode.parentId')

  return {
    node: requireSparkNode(next.node, 'addNode.node'),
    ...(parentId !== undefined ? { parentId } : {}),
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

  const parentId = next.parentId === undefined
    ? undefined
    : normalizeOptionalNodeId(next.parentId, 'addNodes.parentId')

  return {
    nodes: requireNonEmptySparkNodeArray(next.nodes, 'addNodes.nodes'),
    ...(parentId !== undefined ? { parentId } : {}),
    ...(next.index !== undefined ? { index: next.index } : {}),
  }
}

/**
 * 归一化 setProps 输入参数。
 */
function normalizeSetPropsParams(params: SparkNodeTreeSetPropsParams): SparkNodeTreeSetPropsParams {
  const next = requireObjectArg(params, 'setProps.params')
  return {
    nodeId: requireNonEmptyString(next.nodeId, 'setProps.nodeId'),
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
      nodeId: requireNonEmptyString(
        typeof item['nodeId'] === 'string' ? item['nodeId'] : undefined,
        `setPropsBatch.items[${index}].nodeId`,
      ),
      props: requireRecord(item['props'], `setPropsBatch.items[${index}].props`),
      ...(item['merge'] !== undefined ? { merge: item['merge'] as boolean } : {}),
    }
  })
  assertUniqueNodeIds(items.map((item) => item.nodeId), 'setPropsBatch.items')
  return { items }
}

/**
 * 归一化 replaceNode 输入参数。
 */
function normalizeReplaceParams(params: SparkNodeTreeReplaceParams): SparkNodeTreeReplaceParams {
  const next = requireObjectArg(params, 'replaceNode.params')
  return {
    nodeId: requireNonEmptyString(next.nodeId, 'replaceNode.nodeId'),
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
      nodeId: requireNonEmptyString(
        typeof item['nodeId'] === 'string' ? item['nodeId'] : undefined,
        `replaceNodes.items[${index}].nodeId`,
      ),
      node: requireSparkNode(item['node'], `replaceNodes.items[${index}].node`),
    }
  })
  assertUniqueNodeIds(items.map((item) => item.nodeId), 'replaceNodes.items')
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
  const nodeIds = requireNonEmptyStringArray(next.nodeIds, 'removeNodes.nodeIds')
  assertUniqueNodeIds(nodeIds, 'removeNodes.nodeIds')
  return { nodeIds }
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
  return value
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
  props?: Record<string, unknown>
  children?: SparkNodeChildren
}): SparkNode {
  return {
    type: params.type,
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
  return buildSparkNode({
    type,
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
 * 对 addNode 做一次不可变写入，返回新 root 与动作结果。
 */
function applyAddNode(
  root: SparkNode,
  params: SparkNodeTreeAddParams,
): { nextRoot: SparkNode; result: SparkNodeAddResult } {
  const parent = resolveParentNode(root, params.parentId)
  const currentChildren = parent.children ?? []
  const index = clampInsertIndex(params.index, currentChildren.length)
  const nextChildren = [...currentChildren]
  nextChildren.splice(index, 0, params.node)

  if (params.parentId === null || params.parentId === undefined) {
    return {
      nextRoot: copySparkNode(root, KEEP, KEEP, nextChildren),
      result: {
        node: params.node,
        index,
      },
    }
  }

  const rewritten = rewriteNodeById(root, params.parentId, (location) => ({
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
 * 对 setProps 做一次不可变写入。
 */
function applySetProps(
  root: SparkNode,
  params: SparkNodeTreeSetPropsParams,
): { nextRoot: SparkNode; result: SparkNodeSetPropsResult } {
  const location = requireLocation(root, params.nodeId)
  const nextProps = params.merge === false
    ? { ...params.props }
    : { ...(location.node.props ?? {}), ...params.props }

  const rewritten = rewriteNodeById(root, params.nodeId, (currentLocation) => {
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
  const previous = requireLocation(root, params.nodeId).node

  const rewritten = rewriteNodeById(root, params.nodeId, () => ({
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
  const location = requireLocation(root, params.nodeId)
  if (location.parent === null) {
    throw new Error('Cannot remove root node')
  }

  const rewritten = rewriteNodeById(root, params.nodeId, (currentLocation) => ({
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
