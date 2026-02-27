/**
 * SPARK 数据空间类型定义
 *
 * 数据模型、权限、过滤/排序、关系、树 的唯一类型源
 */

import type { DataTable } from './data-table'
import type { DataView as SparkDataView } from './data-view'

// ===== 视图状态事件 =====

/**
 * 事件来源标识（用于日志和调试）
 * - 'ui': UI 组件触发（用户交互，如点击行）
 * - 'program': 程序代码直接调用（如 __init__ 中设置）
 * - 'sync': DataSet→UI 同步触发（由 useRuleBinding 发起）
 * - 'cascade': 级联更新触发（父视图变化导致子视图更新）
 * - 'auto': 自动触发（如 loadFromServer 后的 autoCurrentFirst）
 * - 'crud': CRUD 操作触发（增删改后的状态更新）
 */
export type EventSource = 'ui' | 'program' | 'sync' | 'cascade' | 'auto' | 'crud'

/**
 * 事件上下文（用于循环检测）
 * 
 * 每个事件拥有唯一的 ID，在调用链中透传。
 * 当检测到同一个 eventId 再次出现时，说明形成了循环，应立即退出。
 */
export interface EventContext {
  /**
   * 事件唯一标识符
   * - 由事件发起者生成（如 UI 事件处理器）
   * - 沿着调用链透传（DataSet → UI → DataSet）
   * - 用于检测循环：如果同一个 ID 再次出现，说明循环了
   * 
   * 推荐格式：
   * - 全局唯一：递增数字（如 generateEventId()）
   * - 视图级别：`${tableName}@${viewId}:${counter}`
   * - 组件级别：`${componentId}:${counter}`
   */
  eventId: number | string
  
  /**
   * 事件来源类型（必填，用于日志和调试）
   */
  source: EventSource
  
  /**
   * 扩展元数据（可选）
   * - tableName: 表名
   * - viewId: 视图ID
   * - componentId: 组件实例ID
   * - timestamp: 时间戳
   */
  meta?: Record<string, unknown>
}

/** 视图状态变化事件 */
export interface ViewStateEvent {
  tableName: string
  viewId: string
  changeType: 'currentRow' | 'selectedRows' | 'cleared' | 'rows' | 'requestState' | 'mutating'
  row?: IDataRow | null
  rows?: IDataRow[]
  
  /**
   * 事件上下文（必填，用于循环检测和调试）
   * 
   * 工作原理：
   * 1. 事件发起者（如 UI 事件处理器）创建新的 EventContext
   * 2. 调用 DataSet API 时传入 context
   * 3. DataSet 发射事件时透传 context
   * 4. 订阅者检查是否已处理过此 eventId
   * 5. 如果已处理，说明形成循环，立即退出
   * 
   * 优势：
   * - 精确检测循环（基于唯一 ID）
   * - 无时序依赖
   * - 支持多实例
   * - 易于追踪和调试
   */
  context: EventContext
}

// ===== 权限类型 =====

/**
 * 实例级权限（行级）- 服务端权限快照
 *
 * 采用类似JWT的设计理念，权限信息由服务端一次性计算并返回前端，
 * 前端保存权限快照，在数据更新时回传给服务端，避免重复计算。
 */
export interface IInstancePermission {
  allowDelete?: boolean
  editableFields?: string[]
  hiddenFields?: string[]
  maskedFields?: string[]

  // ===== 权限快照 =====
  permissionToken?: string  // 权限令牌（后端验证有效性）
}

/**
 * 模型级权限（表级）- 服务端权限快照
 *
 * 权限信息在首次数据加载时由服务端计算并缓存，
 * 前端负责维护和传递权限状态。
 */
export interface IModelPermission {
  allowCreate?: boolean
  allowImport?: boolean
  allowExport?: boolean

  // ===== 权限快照 =====
  permissionToken?: string  // 权限令牌（后端验证有效性）
}

/** 实例权限字段名 */
export const INSTANCE_PERMISSION_FIELD = '_perm' as const

/** 模型权限字段名 */
export const MODEL_PERMISSION_FIELD = '_modelPerm' as const

/** 字段可见性枚举 */
export enum FieldVisibility {
  Visible = 'visible',
  Masked = 'masked',
  Hidden = 'hidden'
}

/** 组件级别枚举 */
export enum ComponentLevel {
  Model = 'model',
  Instance = 'instance',
  Field = 'field'
}

// ===== 基础数据类型 =====

/** 数据行（带权限） */
export type IDataRow = Record<string, unknown> & {
  _perm?: IInstancePermission
}

/** 数据源（带权限和分页） */
export interface IDataSource {
  rows?: IDataRow[]
  _modelPerm?: IModelPermission
  total?: number
  page?: number
  pageSize?: number
}

// ===== 数据模型类型 =====

/** 数据列定义 */
export interface DataColumn {
  name: string
  type: string
  label?: string
  allowDBNull?: boolean
  defaultValue?: unknown
  isPrimaryKey?: boolean
  autoIncrement?: boolean

  // ===== 计算字段属性 =====

  /** 计算表达式（JSON格式，如 {"op": "+", "left": "field1", "right": "field2"}） */
  computeExpression?: unknown
}

/** CRUD API配置（继承 TreeApi，树接口族直接平铺在此） */
export interface CrudApi extends TreeApi {
  create?: HttpEndpoint
  retrieve?: HttpEndpoint
  update?: HttpEndpoint
  delete?: HttpEndpoint
  list?: HttpEndpoint & {
    pagination?: {
      pageParam?: string
      sizeParam?: string
      sortParam?: string
    }
  }
  batch?: {
    create?: HttpEndpoint
    update?: HttpEndpoint
    delete?: HttpEndpoint
  }
  import?: HttpEndpoint
  export?: HttpEndpoint
}

/** HTTP端点定义 */
export interface HttpEndpoint {
  /** 请求URL */
  url: string
  /** HTTP方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** 请求头 */
  headers?: Record<string, string>
  /** URL查询参数 */
  params?: Record<string, unknown>
  /** URL路径参数 */
  pathParams?: string[]
  /** API基础地址 */
  baseURL?: string
}

// ===== 序列化接口 =====

/** 数据视图元数据 */
export interface IViewMetadata {
  tableName?: string
  viewId?: string
  rows?: IDataRow[]
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  /** 请求成功后自动将 currentRow 设为第一行 */
  autoCurrentFirst?: boolean
  /** 请求成功后自动将 selectedRows 设为第一行 */
  autoSelectFirst?: boolean
  /**
   * setCurrentRow 时是否自动将 selectedRows 同步替换为 [row]（默认 true）
   *
   * - `true`（默认）：selectedRows 跟随 currentRow，两者始终包含关系（常规表格模式）
   * - `false`：currentRow 与 selectedRows 完全独立，selectedRows 类似购物车，
   *            点击行只改变焦点行，不影响已勾选集合
   *
   * 注意：此属性仅影响运行时的 setCurrentRow 调用；
   * 服务端数据加载后的自动首选行为仍由 autoCurrentFirst / autoSelectFirst 独立控制。
   */
  selectionFollowsCurrent?: boolean
  page?: number
  pageSize?: number
  /** 树结构字段配置（idField/parentIdField/textField/depthLimit/lazy/treeMode），属于视图层关注点 */
  treeConfig?: TreeConfig
}

/** 数据表元数据 */
export interface ITableMetadata extends IViewMetadata {
  tableName: string
  columns: DataColumn[]
  api: CrudApi | undefined
  views: Record<string, IViewMetadata> | undefined
  loading: boolean | undefined
  error: string | undefined
}

/** 数据集元数据 */
export interface IDataSetMetadata {
  dataSetName: string
  tables: Record<string, ITableMetadata>
  relations: DataRelation[] | undefined
  version: number | undefined
  pageId: string | undefined
}

// ===== 过滤和排序类型 =====

/** 依赖类型 */
export type DependencyType =
  | 'currentRow'
  | 'selectedRows'
  | 'allRows'
  | 'pagedRows'
  | string

/** 排序方向 */
export type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC'

/** 排序表达式 */
export type SortExpression =
  | { field: string; direction: SortDirection }
  | { fields: Array<{ field: string; direction: SortDirection }> }

/** 过滤操作符 */
export type FilterOperator =
  | '==' | '!=' | '>' | '>=' | '<' | '<='
  | 'in' | 'not in' | 'like' | 'not like'
  | 'is null' | 'is not null'
  | 'between' | 'not between'
  | 'startsWith' | 'endsWith' | 'contains'

/** 过滤表达式 */
export type FilterExpression =
  | { field: string; op: FilterOperator; value: unknown }
  | { type: 'and' | 'or'; children: FilterExpression[] }
  | { type: '!condition'; field: string; op: FilterOperator; value: unknown }
  | { type: '!and' | '!or'; children: FilterExpression[] }
  | { func: string; args: unknown[] }

// ===== 关系类型 =====

/** 数据关系定义 */
export interface DataRelation {
  parentTable: string
  parentViewId?: string
  childTable: string
  childViewId?: string
  /** 指定父表中用于匹配的字段（默认为 'id'） */
  parentField?: string
  /** 指定子表中用于匹配的字段（如果未指定，使用 filterExpression.field） */
  childField?: string
  dependencyType: DependencyType
  filterExpression: FilterExpression
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
  /** 父变化时是否自动级联加载子视图（默认 true——仅 `false` 时跳过） */
  autoLoad?: boolean
  relationName?: string
}

// ===== 树类型 =====

/**
 * 树端点 API 配置
 * 对应博文接口族（flat/nested 双模式成套）
 * 每个端点继承 HttpEndpoint，`url` 中可用 `{id}`、`{parentId}` 等路径占位符
 */
export interface TreeApi {
  /**
   * /tree/node — 获取单节点详情
   * params: id
   */
  node?: HttpEndpoint
  /**
   * /tree/children — 获取直接子节点列表
   * params: parentId, limit?
   */
  children?: HttpEndpoint & {
    /** 最大返回子节点数，防止宽度爆炸 */
    limit?: number
  }
  /**
   * /tree/path — 获取祖先链 ID 列表
   * params: id
   * response: { pathIds: string[] }
   */
  path?: HttpEndpoint
  /**
   * /tree/subtree — 差量补齐路径区间（expandToNode 使用）
   * params: fromId, toId, includeTargetChildren?
   * response: Record<string, FlatTreeNode>
   */
  subtree?: HttpEndpoint & {
    /** 是否包含目标节点的直接子节点（默认 true） */
    includeTargetChildren?: boolean
  }
  /**
   * /tree/search — 扁平模式搜索（返回匹配节点 + pathIds）
   * params: keyword, limit?
   */
  search?: HttpEndpoint & {
    limit?: number
  }
  /**
   * /tree/nested — 获取嵌套层级树
   * params: rootId?, depthLimit?, limit?
   * response: NestedTreeNode[]
   */
  nested?: HttpEndpoint & {
    depthLimit?: number
    limit?: number
  }
  /**
   * /tree/nested/search — 层次模式搜索（返回匹配节点 + 嵌套祖先链）
   * params: keyword, limit?
   * response: NestedTreeSearchResult[]
   */
  nestedSearch?: HttpEndpoint & {
    limit?: number
  }
}

/** 树结构字段配置（属于视图层，固化在 DataView）
 * 注：HTTP 接口族配置在 CrudApi，模型始终存储平铺数据
 */
export interface TreeConfig {
  idField?: string
  parentIdField?: string
  textField?: string
  depthLimit?: number
  lazy?: boolean
  /** 树视图模式（默认 'flat'）：模型层始终存储平铺数据，视图层选择返回 flat 还是 nested 组织方式 */
  treeMode?: 'flat' | 'nested'
}

/** 平面树节点 */
export interface FlatTreeNode {
  id: string | number
  parentId?: string | number | null
  name: string
  level?: number
  hasChildren?: boolean
  isLoaded?: boolean
  [key: string]: unknown
}

/** 嵌套树节点 */
export interface NestedTreeNode extends FlatTreeNode {
  children: NestedTreeNode[]
}

/** 树路径 */
export interface TreePath {
  pathIds: Array<string | number>
  pathNodes?: FlatTreeNode[]
}

/**
 * 嵌套树搜索结果
 * 对应 /tree/nested/search 接口返回格式
 * 匹配节点 + 从根到该节点的祖先链（含自身），前端可直接展开定位
 */
export interface NestedTreeSearchResult {
  /** 匹配的节点 */
  node: FlatTreeNode
  /** 从根到该节点的祖先链（含自身，顺序为根→叶） */
  path: FlatTreeNode[]
}

// ===== 请求状态 =====

/**
 * DataView 请求状态机
 *
 * ```
 * Idle ──requestData()──▶ Preparing ──loadFromServer()──▶ Loading
 *                                                                │
 *                                                ┌──────────────┴──────────────┐
 *                                              Loaded                        Failed
 * ```
 */
export enum RequestState {
  /** 未请求（初始态 / 被外部重置后） */
  Idle         = 0,
  /** 准备中：逐个检查父依赖、组装查询参数（条件具备前） */
  Preparing     = 1,
  /** loadFromServer 网络请求中（从服务器请求中） */
  Loading      = 2,
  /** 已完成 */
  Loaded       = 3,
  /** 失败（父依赖不满足 / 网络错误） */
  Failed       = 4,
}

// ===== 数据集接口 =====

/**
 * 数据集公共契约
 *
 * 消费者（渲染层、能力系统）应依赖此接口而非具体 DataSet 类，
 * 便于测试 mock 与未来扩展。
 */
export interface IDataSet {
  /** 数据集名称 */
  readonly dataSetName: string
  /** 数据表集合 */
  readonly tables: Record<string, DataTable>
  /** 数据关系定义 */
  readonly relations: DataRelation[] | undefined
  /** 版本号 */
  readonly version: number | undefined
  /** 页面ID */
  readonly pageId: string | undefined

  /** 查询以指定视图为父的子关系 */
  getChildRelations(parentTable: string, parentViewId: string): DataRelation[]
  /** 查询以指定视图为子的父关系 */
  getParentRelations(childTable: string, childViewId: string): DataRelation[]
  /** 获取数据表 */
  getTable(name: string): DataTable | undefined
  /** 获取数据视图（委托到 DataTable） */
  getView(tableName: string, viewId?: string): SparkDataView | undefined
  /** 序列化为元数据对象 */
  toData(): IDataSetMetadata
  /** 序列化（供 JSON.stringify 自动调用） */
  toJSON(): IDataSetMetadata
  /**
   * 订阅数据集级别的加载事件（覆盖所有已注册表的所有视图）
   * @returns 取消订阅函数
   */
  on(
    event: 'loadSuccess' | 'loadError',
    handler: (payload: { tableName: string; viewId: string; error?: Error }) => void
  ): () => void
  /**
   * 订阅此 DataSet 内任意视图的状态变化。
   *
   * 严格作用于本 DataSet 实例，多个 PageRenderer 并存时互不干扰（替代全局 event-bus）。
   * 订阅时遍历当前已存在的所有视图；如需监听后续动态创建的视图，可在创建后重新订阅。
   *
   * @returns 取消订阅函数（组件卸载时调用）
   */
  onAnyViewChange(handler: (evt: ViewStateEvent) => void): () => void
}

// ===== CRUD服务相关类型 =====

/**
 * CRUD操作结果
 */
export interface CrudResult<T = unknown> {
  success: boolean
  data?: T
  error?: Error
  message?: string
  code?: string
  timestamp?: number
}

/**
 * 分页查询参数 - 支持权限快照传递
 */
export interface QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  filter?: Record<string, unknown> | FilterExpression
  search?: string
  fields?: string[]  // 要查询的字段列表
  include?: string[] // 要包含的关联数据

  // ===== 权限快照利用 =====
  modelPermission?: IModelPermission       // 完整的模型级权限对象（用于提取权限令牌）
  instancePermission?: IInstancePermission // 完整的实例级权限对象（用于提取权限令牌）

  [key: string]: unknown
}

/**
 * 批量操作结果
 */
export interface BatchResult {
  successCount: number
  failureCount: number
  results: CrudResult[]
  errors: Error[]
  totalTime?: number
}

/**
 * CRUD操作配置 - 集成权限快照利用
 */
export interface CrudOperationConfig {
  timeout?: number
  retryCount?: number
  skipPermissionCheck?: boolean

  // ===== 权限快照利用 =====
  modelPermission?: IModelPermission       // 完整的模型级权限对象（用于提取权限令牌）
  instancePermission?: IInstancePermission // 完整的实例级权限对象（用于提取权限令牌）

  // ===== 数据处理 =====
  validateData?: boolean
  transformRequest?: (data: unknown) => unknown
  transformResponse?: (data: unknown) => unknown
}
