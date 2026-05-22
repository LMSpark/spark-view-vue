/**
 * 导航模型类型定义。
 *
 * 描述应用导航树的节点类型、权限模式、上下文状态等。
 * 由 page-config 和 spark-app 共享使用。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组（按导航树建模流程）                         │
 * │                                                      │
 * │  1. 枚举联合：ChildPlacement / NavNodeKind            │
 * │              LinkTarget / NavPermissionMode           │
 * │  2. 基础模块：AppModuleBase                           │
 * │  3. 导航配置：AppNavigation                           │
 * │  4. 节点定义：NavNode / AppNavRoot                    │
 * │  5. 区域布局：RegionItems / RegionVisibility          │
 * │  6. 上下文：  NavContextItem / NavContextConfig       │
 * │              NavContextState                          │
 * └──────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════
// 1. 枚举联合
//
// 定义导航节点的行为约束，是后续接口类型的字段值域。
// ═══════════════════════════════════════════════════════

/** 子节点布局位置：决定子节点在 UI 中的渲染区域 */
export type ChildPlacement = 'header' | 'sidebar' | 'toolbar' | 'user-menu' | 'parent' | 'flat'

/**
 * 导航节点类型。
 *
 * - system-directory / module: 系统目录和模块，用于分组
 * - system-page / system-action: 系统级页面和操作
 * - page / sub-page: 业务页面和子页面
 * - link: 外链
 * - ref: 引用节点（引用其它导航树中的节点）
 */
export type NavNodeKind =
  | 'system-directory'
  | 'module'
  | 'system-page'
  | 'system-action'
  | 'page'
  | 'link'
  | 'sub-page'
  | 'ref'

/** 外链打开方式 */
export type LinkTarget = 'iframe' | 'new-tab' | 'self'

/** 权限未匹配时的展示模式 */
export type NavPermissionMode = 'none' | 'masked' | 'invisible'

// ═══════════════════════════════════════════════════════
// 2. 基础模块
//
// 所有导航节点的公共元数据基类。
// ═══════════════════════════════════════════════════════

/** 模块基础信息：ID、标题、描述、版本号 */
export type AppModuleBase = {
  id?: string
  /** 模块标题 */
  title: string
  /** 模块描述 */
  description?: string
  /** 版本号 */
  version?: string
}

// ═══════════════════════════════════════════════════════
// 3. 导航配置
//
// 描述一个节点在导航系统中的行为：图标、排序、可见性、权限等。
// ═══════════════════════════════════════════════════════

/** 导航行为配置：图标、排序、可见性、权限模式、子节点布局等 */
export type AppNavigation = {
  /** 图标标识符 */
  icon?: string
  /** 节点类型 */
  nodeKind?: NavNodeKind
  /** 子节点布局位置 */
  childPlacement?: ChildPlacement
  /** 动态上下文：字符串源 / 静态项列表 / 上下文配置对象 */
  context?: string | NavContextItem[] | NavContextConfig
  /** 排序权重 */
  order?: number
  /** 是否隐藏 */
  hidden?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 节点后是否显示分割线 */
  dividerAfter?: boolean
  /** 权限未匹配时的展示模式 */
  permissionMode?: NavPermissionMode
}

// ═══════════════════════════════════════════════════════
// 4. 节点定义
//
// 导航树的核心节点类型：单个节点 + 根节点。
// ═══════════════════════════════════════════════════════

/**
 * 导航树节点。
 *
 * 继承 AppModuleBase + AppNavigation，扩展路径、跳转、引用等业务字段。
 */
export type NavNode = AppModuleBase & AppNavigation & {
  /** 节点唯一标识符 */
  id: string
  /** 子节点列表 */
  children?: NavNode[]
  /** 页面路径 */
  path?: string
  /** 外链打开方式 */
  linkTarget?: LinkTarget
  /** 重定向目标路径 */
  redirect?: string
  /** 父页面 ID（子页面场景） */
  parentPageId?: string
  /** 引用节点 ID */
  refId?: string
  /** 引用节点的注册树路径 */
  refPath?: string
  /** 引用所属项目 ID */
  refProjectId?: string
  /** 引用是否失效（指向不存在的节点） */
  refBroken?: boolean
}

/**
 * 导航树根节点。
 *
 * 定义整个应用的导航结构：子节点布局 + 首页路径 + 顶层节点列表。
 */
export type AppNavRoot = AppModuleBase & {
  /** 根节点子节点的布局位置（仅 header 或 sidebar） */
  childPlacement: 'header' | 'sidebar'
  /** 根节点下的顶层导航节点列表 */
  children: NavNode[]
  /** 首页路径 */
  homePath?: string
}

// ═══════════════════════════════════════════════════════
// 5. 区域布局
//
// 按 UI 区域对导航节点和可见性进行分组。
// ═══════════════════════════════════════════════════════

/** 按区域分组的导航节点列表 */
export type RegionItems = {
  header: NavNode[]
  sidebar: NavNode[]
  toolbar: NavNode[]
  userMenu: NavNode[]
}

/** 各区域是否可见 */
export type RegionVisibility = {
  header: boolean
  sidebar: boolean
  toolbar: boolean
  userMenu: boolean
}

// ═══════════════════════════════════════════════════════
// 6. 动态上下文
//
// 导航节点可绑定动态上下文（如环境切换、租户选择等），
// 运行时根据用户选择过滤/投影导航树。
// ═══════════════════════════════════════════════════════

/** 上下文下拉选项项 */
export type NavContextItem = {
  /** 选项值 */
  id: string | number
  /** 选项展示文本 */
  title: string
}

/** 动态上下文配置：描述上下文的来源和交互行为 */
export type NavContextConfig = {
  /** 上下文来源：API 端点字符串 或 静态选项列表 */
  source: string | NavContextItem[]
  /** 占位提示文本 */
  placeholder?: string
  /** 默认选中值 */
  defaultValue?: string | number
  /** 参数名（注入到页面 URL 或请求中） */
  paramName?: string
}

/** 导航上下文运行时状态：记录当前选中值和加载状态 */
export type NavContextState = {
  /** 上下文配置 */
  config: NavContextConfig
  /** 所属节点 ID */
  nodeId: string
  /** 当前选中值 */
  selected: string | number | null
  /** 已加载的选项列表 */
  items: NavContextItem[]
  /** 是否正在加载 */
  loading: boolean
  /** 加载错误信息 */
  error: string | null
}
