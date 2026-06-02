import type { ComputedRef, InjectionKey } from 'vue'
import type { NavContextState, ProjectNodeData, RegionItems, RegionVisibility } from '@spark-view/spark-project-model'

/* ══════════════════════════════════════════════════════════
 * NavigationContext — Vue 依赖的运行时类型
 *
 * 纯 TS 项目节点类型（ProjectNodeData, ProjectModelData 等）定义在 ProjectNode，
 * 此文件仅保留 Vue 特有的类型。
 * ══════════════════════════════════════════════════════════ */

export type NavigationContext = {
  /** 从根到当前叶子的节点路径 */
  activePath: ComputedRef<ProjectNodeData[]>
  /** 各区域的导航项 */
  regionItems: ComputedRef<RegionItems>
  /** 各区域是否可见（有项为 true） */
  regionVisibility: ComputedRef<RegionVisibility>
  /** 当前模块的上下文选择器状态（null = 当前模块无上下文；作用域：模块下全部页面） */
  moduleContext: ComputedRef<NavContextState | null>
  /** 导航到指定节点（处理外部链接、重定向、首个叶子等） */
  navigateTo: (node: ProjectNodeData) => void
  /** 导航到指定路径（自动追加租户前缀） */
  navigateToPath: (path: string) => void
  /** 设置当前模块上下文选择器的值 */
  setContextValue: (value: string | number | null) => void
  /** 判断节点是否在活动路径上 */
  isNodeActive: (node: ProjectNodeData) => boolean
  /** 获取节点的角标（运行时动态设定） */
  getBadge: (nodeId: string) => string | number | undefined
  /** 设置节点的角标（运行时 API） */
  setBadge: (nodeId: string, value: string | number | undefined) => void}

/** Vue 注入键 */
export const NAV_KEY: InjectionKey<NavigationContext> = Symbol('spark-navigation')
