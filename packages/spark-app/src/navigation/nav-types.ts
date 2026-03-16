import type { ComputedRef, InjectionKey } from 'vue'

/* ══════════════════════════════════════════════════════════
 * 导航模型类型定义
 * ══════════════════════════════════════════════════════════ */

/** 子项存放位置 */
export type ChildPlacement = 'header' | 'sidebar' | 'toolbar' | 'user-menu' | 'parent' | 'flat'

/** 导航节点类型 */
export type NavNodeType = 'item' | 'group'

/** 页面类型：配置驱动 or Vue 组件 */
export type NavPageType = 'config' | 'vue-component'

/* ── 上下文选择器 ── */

/** 上下文选项（固定 id + title） */
export interface NavContextItem {
  /** 唯一标识 */
  id: string | number
  /** 显示标题 */
  title: string
}

/** 上下文选择器完整配置 */
export interface NavContextConfig {
  /** 数据来源：URL 字符串（GET，响应 = NavContextItem[]） | 静态数组 */
  source: string | NavContextItem[]
  /** 占位文本（默认 '请选择'） */
  placeholder?: string
  /** 默认值 */
  defaultValue?: string | number
  /** URL query 参数名（选中值同步到 route.query；缺省不同步） */
  paramName?: string
}

/**
 * 上下文选择器输入（约定优先简写）
 *
 * - `string`             → URL 简写（GET，响应 = NavContextItem[]）
 * - `NavContextItem[]`   → 静态列表
 * - `NavContextConfig`   → 完整配置
 */
export type NavContextInput = string | NavContextItem[] | NavContextConfig

/* ── 导航节点 ── */

export interface NavNode {
  /** 唯一标识 */
  id: string
  /** 节点类型 */
  type: NavNodeType
  /** 显示标题 */
  title: string
  /** 节点用途描述（AI 理解语义 + UI tooltip） */
  description?: string
  /** 图标 */
  icon?: string
  /** 路由路径（item 节点） */
  path?: string
  /** 外部链接（新窗口打开） */
  externalUrl?: string
  /** 页面配置 ID（config 类型页面加载 rule.json 时使用）。默认等于 id */
  pageId?: string
  /** 页面类型：'config'（配置驱动）| 'vue-component'（Vue 组件），默认 'config' */
  pageType?: NavPageType
  /** 子节点（group 节点） */
  children?: NavNode[]
  /** 子项存放位置（group 节点） */
  childPlacement?: ChildPlacement
  /** 默认重定向路径（group 节点） */
  redirect?: string
  /** 上下文选择器（字符串=URL / 数组=静态列表 / 对象=完整配置） */
  context?: NavContextInput
  /** 排序权重（默认 0，升序） */
  order?: number
  /** 隐藏（不显示在菜单，但参与活动路径计算） */
  hidden?: boolean
  /** 禁用（灰色不可交互） */
  disabled?: boolean
  /** 工具栏动作标识符（toolbar 节点，匹配内置按钮） */
  action?: string
  /** 在该节点后显示分割线 */
  dividerAfter?: boolean
}

/** 导航根配置（根节点只允许 header / sidebar 两种放置位置） */
export interface NavRoot {
  /** 顶层子项存放位置 */
  childPlacement: 'header' | 'sidebar'
  /** 顶层子节点（含 childPlacement='toolbar' 的工具栏组） */
  children: NavNode[]
  /**
   * 应用首页路径（登录后落地页）。
   * 由业务系统导航数据声明，如 '/dashboard'。
   * 未设置时消费方应自行回退。
   */
  homePath?: string
}

/* ── 派生类型（useNavigation 使用） ── */

/** 区域对应的导航项集合 */
export interface RegionItems {
  header: NavNode[]
  sidebar: NavNode[]
  toolbar: NavNode[]
  userMenu: NavNode[]
}

/** 区域可见性 */
export interface RegionVisibility {
  header: boolean
  sidebar: boolean
  toolbar: boolean
  userMenu: boolean
}

/** 上下文选择器运行时状态 */
export interface NavContextState {
  config: NavContextConfig
  nodeId: string
  selected: string | number | null
  items: NavContextItem[]
  loading: boolean
  error: string | null
}

/* ── 注入上下文 ── */

export interface NavigationContext {
  /** 从根到当前叶子的节点路径 */
  activePath: ComputedRef<NavNode[]>
  /** 各区域的导航项 */
  regionItems: ComputedRef<RegionItems>
  /** 各区域是否可见（有项为 true） */
  regionVisibility: ComputedRef<RegionVisibility>
  /** 当前模块的上下文选择器状态（null = 当前模块无上下文；作用域：模块下全部页面） */
  moduleContext: ComputedRef<NavContextState | null>
  /** 导航到指定节点（处理外部链接、重定向、首个叶子等） */
  navigateTo: (node: NavNode) => void
  /** 导航到指定路径（自动追加租户前缀） */
  navigateToPath: (path: string) => void
  /** 设置当前模块上下文选择器的值 */
  setContextValue: (value: string | number | null) => void
  /** 判断节点是否在活动路径上 */
  isNodeActive: (node: NavNode) => boolean
  /** 获取节点的角标（运行时动态设定） */
  getBadge: (nodeId: string) => string | number | undefined
  /** 设置节点的角标（运行时 API） */
  setBadge: (nodeId: string, value: string | number | undefined) => void
}

/** Vue 注入键 */
export const NAV_KEY: InjectionKey<NavigationContext> = Symbol('spark-navigation')
