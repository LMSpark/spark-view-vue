/**
 * Dock 子节点提取工具。
 *
 * 容器组件使用此工具从 children 数组中提取已知 dock 类型的子节点，
 * 将它们与普通内容子节点分离。
 *
 * Dock 子节点是普通的 SparkNode，其 `type` 匹配已注册的 dock 组件类型
 * （如 `r-toolbar`、`r-actions`、`r-filter`）。容器通过 type 匹配发现它们，
 * 读取其 `props` 和 `children` 用于停靠区域渲染。
 */
import { computed, type ComputedRef } from 'vue'
import { isSparkNode, getSparkNodeChildren, type SparkNode, type SparkNodeChildren } from '../../../core/types.js'

/**
 * Dock prop 源类型。
 *
 * 使用 `object` 而非 `Record<string, unknown>`，避免 Vue `defineProps<Props>()` 返回的
 * `Readonly<Props>` 缺少索引签名而导致容器组件调用处需要 double-cast。
 * 运行时索引访问在 `collectPropDocks` 内部单点完成。
 */
type DockPropSource = object

/**
 * Dock 提取结果。
 *
 * `docks` 是按 type 索引的 dock 节点映射（每种类型只取第一个匹配）。
 * `contentChildren` 是剩余的非 dock 子节点（保持原始顺序）。
 */
export interface DockExtractionResult {
  /** 按 dock type 索引的停靠节点（同 type 只保留第一个） */
  docks: ReadonlyMap<string, SparkNode>
  /** 剩余的内容子节点（非 dock 节点 + 文本/数字字面量） */
  contentChildren: SparkNodeChildren
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function dockTypeToPropName(dockType: string): string {
  return dockType.startsWith('r-') ? dockType.slice(2) : dockType
}

function normalizeDockPropNode(dockType: string, rawValue: unknown): SparkNode | undefined {
  if (rawValue === null || rawValue === undefined || rawValue === false || Array.isArray(rawValue)) {
    return undefined
  }

  if (isSparkNode(rawValue)) {
    return rawValue.type === dockType ? rawValue : { ...rawValue, type: dockType }
  }

  if (!isRecord(rawValue)) return undefined

  const rawProps = isRecord(rawValue['props']) ? rawValue['props'] : {}
  const inlineProps = Object.fromEntries(
    Object.entries(rawValue).filter(([key]) => key !== 'type' && key !== 'props' && key !== 'children' && key !== 'id')
  )
  const mergedProps = {
    ...inlineProps,
    ...rawProps,
  }
  const rawChildren = Array.isArray(rawValue['children']) ? rawValue['children'] as SparkNodeChildren : undefined
  const rawId = typeof rawValue['id'] === 'string' ? rawValue['id'] : undefined

  return {
    type: dockType,
    ...(Object.keys(mergedProps).length > 0 ? { props: mergedProps } : {}),
    ...(rawChildren !== undefined ? { children: rawChildren } : {}),
    ...(rawId !== undefined ? { id: rawId } : {}),
  }
}

function collectPropDocks(
  dockTypes: ReadonlySet<string>,
  propSource: DockPropSource | undefined,
): ReadonlyMap<string, SparkNode> {
  const docks = new Map<string, SparkNode>()
  if (propSource === undefined) return docks

  // 单点 cast：运行时按 dock 类型名查找属性值，类型安全由 normalizeDockPropNode 保证。
  const source = propSource as Record<string, unknown>

  for (const dockType of dockTypes) {
    const propName = dockTypeToPropName(dockType)
    const dockNode = normalizeDockPropNode(dockType, source[propName])
    if (dockNode !== undefined) {
      docks.set(dockType, dockNode)
    }
  }

  return docks
}

/**
 * 从子节点数组中提取指定 dock 类型的子节点。
 *
 * @param children 容器的完整子节点列表
 * @param dockTypes 该容器识别的 dock 组件类型集合
 * @returns Dock 映射 + 内容子节点
 *
 * @example
 * ```ts
 * const { docks, contentChildren } = extractDockChildren(
 *   props.children,
 *   TABLE_DOCK_TYPES, // Set(['r-toolbar', 'r-actions', 'r-filter'])
 * )
 * const toolbarNode = docks.get('r-toolbar')
 * const toolbarChildren = getSparkNodeChildren(toolbarNode?.children)
 * const toolbarPosition = toolbarNode?.props?.position
 * ```
 */
export function extractDockChildren(
  children: SparkNodeChildren | undefined,
  dockTypes: ReadonlySet<string>,
  propSource?: DockPropSource,
): DockExtractionResult {
  const normalized = getSparkNodeChildren(children)
  const propDocks = collectPropDocks(dockTypes, propSource)

  if (normalized.length === 0 && propDocks.size === 0) {
    return { docks: new Map(), contentChildren: [] }
  }

  const docks = new Map<string, SparkNode>()
  const contentChildren: SparkNodeChildren = []

  for (const child of normalized) {
    if (isSparkNode(child) && dockTypes.has(child.type)) {
      // 同 type 只保留第一个 dock 节点
      if (!docks.has(child.type)) {
        docks.set(child.type, child)
      }
    } else {
      contentChildren.push(child)
    }
  }

  for (const [dockType, dockNode] of propDocks) {
    if (!docks.has(dockType)) {
      docks.set(dockType, dockNode)
    }
  }

  return { docks, contentChildren }
}

// ── 各容器预定义的 dock type 集合 ──────────────────────────────────────────

/** r-table 识别的 dock 类型 */
export const TABLE_DOCK_TYPES: ReadonlySet<string> = new Set(['r-toolbar', 'r-actions', 'r-filter'])

/** r-tree 识别的 dock 类型 */
export const TREE_DOCK_TYPES: ReadonlySet<string> = new Set(['r-toolbar', 'r-actions', 'r-editor'])

/** r-list 识别的 dock 类型 */
export const LIST_DOCK_TYPES: ReadonlySet<string> = new Set(['r-toolbar', 'r-actions'])

/** r-form / r-detail 识别的 dock 类型 */
export const FORM_DOCK_TYPES: ReadonlySet<string> = new Set(['r-toolbar'])

/** r-tabs / r-collapse / r-steps 识别的 dock 类型 */
export const NAVIGATION_DOCK_TYPES: ReadonlySet<string> = new Set(['r-toolbar'])

/** r-dialog / r-drawer 识别的 dock 类型 */
export const OVERLAY_DOCK_TYPES: ReadonlySet<string> = new Set(['r-header', 'r-footer'])

/** r-section 识别的 dock 类型 */
export const SECTION_DOCK_TYPES: ReadonlySet<string> = new Set(['r-header'])

/** r-toolbar 识别的 dock 类型 */
export const TOOLBAR_DOCK_TYPES: ReadonlySet<string> = new Set(['r-tail'])

// ── 响应式 composable ──────────────────────────────────────────────────────

/**
 * 响应式 dock 提取结果。
 *
 * 所有返回值都是 ComputedRef，跟随 children 变化自动更新。
 */
export interface UseDockExtractionReturn {
  /** 按 dock type 索引的节点映射 */
  docks: ComputedRef<ReadonlyMap<string, SparkNode>>
  /** 剩余的内容子节点 */
  contentChildren: ComputedRef<SparkNodeChildren>
  /** 便捷访问：按 type 获取 dock 节点 */
  getDock: (type: string) => SparkNode | undefined
  /** 便捷访问：获取 dock 节点的 children */
  getDockChildren: (type: string) => SparkNode[]
  /** 便捷访问：获取 dock 节点的某个 prop */
  getDockProp: <T = unknown>(type: string, propName: string) => T | undefined
}

export interface UseDockExtractionOptions {
  /**
   * 结构化 dock prop 源。
   *
   * 例如：
   * `{ toolbar: { type: 'r-toolbar', children: [...] } }`
   */
  propSource?: ComputedRef<DockPropSource | undefined>
}

/**
 * 响应式 dock 提取 composable。
 *
 * 容器组件使用：
 * ```ts
 * const { contentChildren, getDock, getDockChildren, getDockProp } =
 *   useDockExtraction(computed(() => props.children), TABLE_DOCK_TYPES)
 *
 * const toolbarChildren = getDockChildren('r-toolbar')
 * const toolbarPosition = getDockProp<string>('r-toolbar', 'position')
 * ```
 */
export function useDockExtraction(
  children: ComputedRef<SparkNodeChildren | undefined>,
  dockTypes: ReadonlySet<string>,
  options?: UseDockExtractionOptions,
): UseDockExtractionReturn {
  const extraction = computed(() => extractDockChildren(
    children.value,
    dockTypes,
    options?.propSource?.value,
  ))

  const docks = computed(() => extraction.value.docks)
  const contentChildren = computed(() => extraction.value.contentChildren)

  function getDock(type: string): SparkNode | undefined {
    return docks.value.get(type)
  }

  function getDockChildren(type: string): SparkNode[] {
    return getSparkNodeChildren(getDock(type)?.children)
  }

  function getDockProp<T = unknown>(type: string, propName: string): T | undefined {
    const dock = getDock(type)
    if (dock?.props === undefined) return undefined
    return dock.props[propName] as T | undefined
  }

  return {
    docks,
    contentChildren,
    getDock,
    getDockChildren,
    getDockProp,
  }
}
