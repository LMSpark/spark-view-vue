/**
 * SparkNode - 页面配置层的组件节点模型。
 *
 * 这是 rule.json 的唯一结构契约，也对应运行时渲染树的最小输入结构。
 */

/**
 * SparkNode 子节点数组。
 *
 * 允许混合结构节点与纯文本子节点（string / number）；消费侧可用
 * `getSparkNodeChildren()` 过滤出结构节点。
 */
export type SparkNodeChildren = Array<SparkNode | string | number>

export type SparkNode = {
  /** 组件类型（对应 ComponentDefinition.type） */
  type: string
  /** 节点定位 id（SparkNodeTree / renderer key / capability context 等运行时定位统一以此为准） */
  id?: string
  /** 组件属性（业务输入通过 props 传递，如 dataViewKey / class / 组件自有配置项） */
  props?: Record<string, unknown>
  /** 子组件配置（递归）；结构子节点必须是已注册组件 type，也可混入字符串/数字文本节点 */
  children?: SparkNodeChildren
}

/**
 * SparkNode 结构键集合（type / id / props / children）。
 */
export const SPARK_NODE_STRUCT_KEYS: ReadonlySet<string> = new Set<string>(['type', 'id', 'props', 'children'])

function getOwnPropertyKeys(value: object): string[] {
  const keys: string[] = []
  for (const key of Object.getOwnPropertyNames(value)) {
    try { keys.push(key) } catch { /* ignore */ }
  }
  return keys
}

function assertSparkNodeRootKeys(node: SparkNode): void {
  for (const key of getOwnPropertyKeys(node)) {
    if (!SPARK_NODE_STRUCT_KEYS.has(key)) {
      throw new Error(`[spark] SparkNode root field "${key}" is invalid. Put business input under SparkNode.props.`)
    }
  }
}

function normalizeSparkNodeChildren(children: SparkNodeChildren | undefined): SparkNodeChildren {
  if (!Array.isArray(children)) return []
  return children.map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return child
    if (isSparkNode(child)) return normalizeSparkNode(child)
    throw new Error('[spark] SparkNode.children must contain only SparkNode, string or number')
  })
}

/**
 * 归一化 SparkNode 的结构语义。
 *
 * 统一处理：
 * - type 必须是非空字符串
 * - 节点定位 id：只接受顶层 id
 * - props 非纯对象（null / 数组 / 原始值）→ 省略 props 键
 * - children 缺省或非数组 → `[]`
 */
export function normalizeSparkNode(node: SparkNode): SparkNode {
  assertSparkNodeRootKeys(node)

  if (typeof node.type !== 'string' || node.type.trim().length === 0) {
    throw new Error('[spark] SparkNode.type must be a non-empty string')
  }

  const normalizedProps = node.props !== undefined ? { ...node.props } : undefined

  if (normalizedProps !== undefined && Object.prototype.hasOwnProperty.call(normalizedProps, 'id')) {
    throw new Error('[spark] SparkNode.props.id is invalid. Put component identity on SparkNode.id.')
  }

  return {
    type: node.type,
    ...(typeof node.id === 'string' ? { id: node.id } : {}),
    ...(normalizedProps !== undefined && Object.keys(normalizedProps).length > 0 ? { props: normalizedProps } : {}),
    children: normalizeSparkNodeChildren(node.children),
  }
}

function getStringProp(value: object, key: string): string | undefined {
  const desc = Object.getOwnPropertyDescriptor(value, key)
  return desc && typeof desc.value === 'string' ? desc.value : undefined
}

/** 判断值是否为 SparkNode 配置对象。 */
export function isSparkNode(value: unknown): value is SparkNode {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const typeVal = getStringProp(value, 'type')
  return typeVal !== undefined && typeVal.trim().length > 0
}

/** 从混合 children 中提取结构子节点。 */
export function getSparkNodeChildren(children: SparkNodeChildren | undefined): SparkNode[] {
  if (!Array.isArray(children) || children.length === 0) return []
  return children.filter(isSparkNode)
}

/** 读取节点 id。 */
export function nodeId(node: { id?: unknown; props?: Record<string, unknown> }): string | undefined {
  const topLevelId = node.id
  if (typeof topLevelId === 'string') return topLevelId
  return undefined
}

/** 读取节点输入属性。 */
export function nodeInputProp(node: SparkNode, key: string): unknown {
  return node.props?.[key]
}

/** 收集节点可传递输入属性。 */
export function nodeInputProps(node: SparkNode): Record<string, unknown> {
  return node.props ?? {}
}
