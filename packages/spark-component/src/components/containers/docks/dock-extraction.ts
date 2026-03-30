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
): DockExtractionResult {
  const normalized = getSparkNodeChildren(children)
  if (normalized.length === 0) {
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
): UseDockExtractionReturn {
  const extraction = computed(() => extractDockChildren(children.value, dockTypes))

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
