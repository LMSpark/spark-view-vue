/* ══════════════════════════════════════════════════════════
 * 导航模型类型定义（纯 TS，零框架依赖）
 *
 * 从 spark-app 迁移至 spark-utils 基础层，
 * 解除 spark-ai ↔ spark-app 循环依赖。
 * spark-app 保持 re-export 向后兼容。
 * ══════════════════════════════════════════════════════════ */

/** 子项存放位置 */
export type ChildPlacement = 'header' | 'sidebar' | 'toolbar' | 'user-menu' | 'parent' | 'flat'

/**
 * 节点扁平分类（软件工程管理语义）
 *
 * nodeKind 同时编码了页面渲染方式：
 * - `'page'` / `'sub-page'` — 配置驱动页（PageRenderer，加载 rule.json）
 * - `'system-page'` — 系统内置页/动作（静态 Vue 组件 或 toolbar action）
 * - `'link'` — 外部链接（iframe / 新标签页，由 `linkTarget` 区分）
 * - `'module'` / `'system-directory'` — 纯分组容器，无页面渲染
 */
export type NavNodeKind =
  | 'system-directory'
  | 'module'
  | 'system-page'
  | 'page'
  | 'link'
  | 'sub-page'

/** 链接渲染目标（仅 nodeKind='link' 时有意义） */
export type LinkTarget = 'iframe' | 'new-tab'

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
 * NavNode / AppNavRoot 统一继承该接口：
 * - NavNode：节点级（id 必填，children 可选）
 * - AppNavRoot：应用级（children 必填）
 */
export interface AppModuleBase<TChild = unknown> {
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
   * 可下沉为 AppNavRoot 独有字段。
   */
  version?: string
  /** 子项 */
  children?: TChild[]
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
  /** 在该节点后显示分割线 */
  dividerAfter?: boolean
}

/* ── 导航节点基（元数据 + 菜单展示，不含激活目标字段） ── */

/** NavNode 共享基接口 */
export interface NavNodeBase extends AppModuleBase<NavNode>, AppNavigation {
  /** 唯一标识 */
  id: string
}

/* ── 激活目标变体（path / action 互斥） ── */

/**
 * 路径节点 — 导航到 SPA 路由或外部链接
 *
 * 适用 nodeKind: page / sub-page / link / system-page（组件型）
 */
export interface NavPathNode extends NavNodeBase {
  /** SPA 路由路径 或 外部 URL（由 nodeKind 决定解释方式） */
  path: string
  /** 链接渲染目标（仅 nodeKind='link' 时有效），默认 'iframe' */
  linkTarget?: LinkTarget
  /** 默认重定向路径 */
  redirect?: string
  /** 子页面归属的父页面 ID（sub-page 专用） */
  parentPageId?: string
  /** @internal path 节点不可同时拥有 action */
  action?: never
}

/**
 * 动作节点 — 触发内置操作
 *
 * 适用 nodeKind: system-page（动作型）、toolbar 按钮
 */
export interface NavActionNode extends NavNodeBase {
  /** 动作标识符（匹配内置按钮） */
  action: string
  /** @internal action 节点不可同时拥有 path */
  path?: never
  linkTarget?: never
  redirect?: never
  parentPageId?: never
}

/**
 * 容器节点 — 纯分组，无页面渲染
 *
 * 适用 nodeKind: module / system-directory
 */
export interface NavContainerNode extends NavNodeBase {
  /** 默认重定向路径（子项首页） */
  redirect?: string
  path?: never
  action?: never
  linkTarget?: never
  parentPageId?: never
}

/**
 * 导航节点 — path 和 action 互斥的判别联合
 *
 * 三种变体：
 * - `NavPathNode` — 有 path（导航到路由/链接）
 * - `NavActionNode` — 有 action（触发内置操作）
 * - `NavContainerNode` — 纯容器（module / system-directory）
 */
export type NavNode = NavPathNode | NavActionNode | NavContainerNode

/**
 * 导航根配置（根节点只允许 header / sidebar 两种放置位置）
 *
 * 同时作为**应用蓝图**的顶层结构：
 * - title / description / version — 应用元信息
 * - children — 模块分组（nodeKind='module'），模块下的子节点为页面（nodeKind='page'）
 * - 既是导航树，也是应用骨架，一套数据两用
 */
export interface AppNavRoot extends AppModuleBase<NavNode> {
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
