/* ══════════════════════════════════════════════════════════
 * 导航模型类型定义（纯 TS，零框架依赖）
 *
 * 从 spark-app 迁移至 spark-utils 基础层，
 * 解除 spark-ai ↔ spark-app 循环依赖。
 * spark-app 保持 re-export 向后兼容。
 * ══════════════════════════════════════════════════════════ */

/** 子项存放位置 */
export type ChildPlacement = 'header' | 'sidebar' | 'toolbar' | 'user-menu' | 'parent' | 'flat'

/** 导航节点类型 */
export type NavNodeType = 'item' | 'group'

/** 页面类型：配置驱动 or Vue 组件 */
export type NavPageType = 'config' | 'vue-component'

/** 超链接渲染模式 */
export type LinkRenderMode = 'iframe' | 'new-tab'

/** 节点扁平分类（软件工程管理语义） */
export type NavNodeKind =
  | 'system-directory'
  | 'module'
  | 'system-page'
  | 'page'
  | 'link'
  | 'sub-page'

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

/**
 * 模块基接口（蓝图/导航共享元数据）
 *
 * NavNode / NavRoot 统一继承该接口：
 * - NavNode：节点级（id 必填，children 可选）
 * - NavRoot：应用级（children 必填）
 */
export interface NavModuleBase<TChild = unknown> {
  /** 唯一标识（蓝图/应用/节点 ID） */
  id?: string
  /** 标题 */
  title: string
  /** 描述 */
  description?: string
  /**
   * 版本（渐进式兼容字段）
   *
   * 当前保留在基接口以支持渐进式开发，后续如需语义收敛，
   * 可下沉为 NavRoot 独有字段。
   */
  version?: string
  /** 子项 */
  children?: TChild[]
}

/**
 * 路由接口（URL / 页面解析相关）
 */
export interface NavRoute {
  /** 路由路径（item 节点） */
  path?: string
  /** 外部链接（新窗口打开） */
  externalUrl?: string
  /** 超链接渲染模式（配置时探测/选择，运行时直接使用） */
  linkRenderMode?: LinkRenderMode
  /** 页面配置 ID（config 类型页面加载 rule.json 时使用）。默认等于 id */
  pageId?: string
  /** 页面类型：'config'（配置驱动）| 'vue-component'（Vue 组件），默认 'config' */
  pageType?: NavPageType
  /** 默认重定向路径（group 节点） */
  redirect?: string
}

/**
 * 导航接口（菜单展示 / 交互行为相关）
 */
export interface AppNavigation {
  /** 图标 */
  icon?: string
  /** 节点扁平分类（用于编辑器语义分层） */
  nodeKind?: NavNodeKind
  /** 子项存放位置（group 节点） */
  childPlacement?: ChildPlacement
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
  /** 子页面归属的父页面 ID（sub-page 专用） */
  parentPageId?: string
  /** 在该节点后显示分割线 */
  dividerAfter?: boolean
}

/* ── 导航节点 ── */

export interface NavNode extends NavModuleBase<NavNode>, NavRoute, AppNavigation {
  /** 唯一标识 */
  id: string
  /** 节点类型 */
  type: NavNodeType
}

/**
 * 导航根配置（根节点只允许 header / sidebar 两种放置位置）
 *
 * 同时作为**应用蓝图**的顶层结构：
 * - title / description / version — 应用元信息
 * - children — 模块分组（nodeKind='module'），模块下的子节点为页面（nodeKind='page'）
 * - 既是导航树，也是应用骨架，一套数据两用
 */
export interface NavRoot extends NavModuleBase<NavNode> {
  /** 顶层子项存放位置 */
  childPlacement: 'header' | 'sidebar'
  /** 顶层子节点（模块 nodeKind='module'，页面 nodeKind='page'） */
  children: NavNode[]
  /**
   * 应用首页路径（登录后落地页）。
   * 由业务系统导航数据声明，如 '/dashboard'。
   * 未设置时消费方应自行回退。
   */
  homePath?: string
}

/* ── 派生类型 ── */

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
