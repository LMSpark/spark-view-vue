/**
 * SPARK 数据空间类型定义
 * 
 * ⚠️ 重要：这是数据空间高级类型的唯一定义源
 * - DataTable, DataSet, BindingContext, TreeManager 等高级类型在此定义
 * - IDataRow, HttpRequestConfig 等基础类型从 spark-utils 导入并重新导出（便于类型系统一致性）
 * - 保持类型系统的单一职责和清晰依赖关系
 * 
 * 参考：https://ligh60.blog.csdn.net/article/details/150585411
 */

import type { 
  IDataRow as IDataRowBase, 
  IDataSource,
  IDataRowWithPermission,
  IModelPermission,
  IInstancePermission,
  HttpRequestConfig 
} from '@spark-view/spark-utils'

// 重新导出基础类型（数据空间需要这些类型）
export type IDataRow = IDataRowBase
export type { 
  HttpRequestConfig, 
  IDataSource, 
  IDataRowWithPermission,
  IModelPermission,
  IInstancePermission
}

// ==================== 基础类型 ====================

/**
 * 数据绑定上下文数据接口（纯数据，用于序列化）
 * 
 * 作用域：单个数据表（DataTable）的某个绑定实例
 * 
 * 用途：
 * - 表示数据状态的纯数据结构
 * - 支持 JSON 序列化/反序列化
 * - 用于配置文件、网络传输等场景
 */
export interface IBindingContextData {
  // ===== 数据状态 =====
  currentRow?: IDataRowWithPermission | null
  currentRowIndex?: number | null  // 当前行在 rows 中的索引（null 表示无当前行）
  selectedRows?: IDataRowWithPermission[]
  selectedRowIndices?: number[]    // 选中行的索引数组（对应 rows 中的位置）
  rows?: IDataRowWithPermission[]  // 支持权限的数据行
  originalRows?: IDataRowWithPermission[]
  
  // ===== 宿主信息 =====
  hostTable?: string
  contextId?: string
  
  // ===== 扩展属性 =====
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean
  autoDeselectOnEmpty?: boolean
  
  // ===== 分页状态 =====
  pagination?: {
    pageIndex?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
}

/**
 * 数据绑定上下文接口（包含方法，用于运行时）
 * 
 * 扩展 IBindingContextData，添加必需的方法和运行时保证的字段
 * 同时实现 IDataSource，支持权限控制和分页
 * 
 * 典型使用场景：
 * - el-table 的 dataKey 绑定
 * - 主从视图联动（通过 filterExpression）
 * - 表格行选中状态管理
 * - 带权限的数据源
 */
export interface IBindingContext extends IBindingContextData, IDataSource {
  // ===== 运行时必需字段（覆盖可选） =====
  currentRow: IDataRowWithPermission | null
  currentRowIndex: number | null   // 必需：当前行索引
  selectedRows: IDataRowWithPermission[]
  selectedRowIndices: number[]     // 必需：选中行索引数组
  rows: IDataRowWithPermission[]  // 必需：支持权限的数据行（覆盖 IDataSource.rows）
  hostTable: string
  contextId: string
  
  // ===== 数据视图配置 =====
  filterExpression?: FilterExpression  // 行过滤表达式（定义当前视图显示哪些行）
  sortExpression?: SortExpression      // 排序表达式（定义行的排序规则）
  
  // ===== 核心方法（运行时必需） =====
  setCurrentRow(row: IDataRowWithPermission | null, skipNotify?: boolean): void
  setSelectedRows(rows: IDataRowWithPermission[], skipNotify?: boolean): void
  
  // ===== 序列化方法 =====
  toData(): IBindingContextData
}

/**
 * 列定义：描述表中每个字段的元数据
 */
export interface DataColumn {
  name: string              // 字段名称，必须唯一（原 columnName）
  type: string              // 数据类型，如 'string'、'number'（原 dataType）
  label?: string            // 显示名称（原 caption）
  allowDBNull?: boolean     // 是否允许空值
  defaultValue?: unknown    // 默认值
  isPrimaryKey?: boolean    // 是否主键
  autoIncrement?: boolean   // 是否自增
}

// ==================== API 响应包装 ====================

/**
 * 标准 API 响应包装
 * 
 * 后端统一返回格式，业务数据在 data 字段中
 * 
 * @example
 * ```typescript
 * // 列表响应
 * const response: ApiResponse<IDataSource> = {
 *   code: 200,
 *   message: 'success',
 *   data: {
 *     rows: [{id: 1, name: 'Alice', _perm: {...}}],
 *     total: 100,
 *     page: 1,
 *     pageSize: 20,
 *     _modelPerm: {allowCreate: true}
 *   }
 * }
 * 
 * // 单条数据响应
 * const detailResponse: ApiResponse<IDataRowWithPermission> = {
 *   code: 200,
 *   message: 'success',
 *   data: {id: 1, name: 'Alice', _perm: {...}}
 * }
 * ```
 */
export interface ApiResponse<T = unknown> {
  /** 响应码（200 成功，其他为错误码） */
  code: number
  /** 响应消息 */
  message: string
  /** 业务数据 */
  data: T
  /** 时间戳（可选） */
  timestamp?: string
  /** 追踪 ID（可选，用于日志追踪） */
  traceId?: string
}

/**
 * 分页列表响应类型别名
 */
export type PagedDataResponse = ApiResponse<IDataSource>

/**
 * 单条数据响应类型别名
 */
export type SingleDataResponse<T = Record<string, unknown>> = ApiResponse<IDataRowWithPermission<T>>

// ==================== HTTP API 配置 ====================

/**
 * HTTP 端点定义：API 静态配置（排除运行时选项）
 * 
 * 基于 HttpRequestConfig，排除运行时选项和动态数据
 * 适用于配置文件中的声明式 API 定义
 */
export type HttpEndpoint = Omit<HttpRequestConfig,
  // 运行时选项
  | 'timeout' | 'responseType' | 'cache' | 'cacheKey' | 'cacheExpiry'
  | 'retry' | 'retryDelay' | 'skipRequestInterceptor' | 'skipResponseInterceptor'
  | 'meta'
  // 运行时数据
  | 'data' | 'token'
>

/**
 * CRUD API 组：一组增删改查及导入导出接口
 */
export interface CrudApi {
  create?: HttpEndpoint                       // 新增接口
  retrieve?: HttpEndpoint                     // 查询单条接口
  update?: HttpEndpoint                       // 更新接口
  delete?: HttpEndpoint                       // 删除接口
  list?: HttpEndpoint & {                     // 列表接口
    pagination?: {                            // 分页参数配置
      pageParam?: string                      // 页码参数名
      sizeParam?: string                      // 页大小参数名
      sortParam?: string                      // 排序参数名
    }
  }
  batch?: {                                   // 批量操作
    create?: HttpEndpoint                     // 批量新增
    update?: HttpEndpoint                     // 批量更新
    delete?: HttpEndpoint                     // 批量删除
  }
  import?: HttpEndpoint                       // 导入接口
  export?: HttpEndpoint                       // 导出接口
}

// ==================== DataTable 定义 ====================

/** 事件回调类型 */
export type EventCallback = (...args: unknown[]) => void

/**
 * TreeManager 接口（树形数据管理器）
 */
export interface ITreeManager {
  setBindingContext(context: IBindingContext): void
  getBindingContext(): IBindingContext | undefined
  getConfig(): TreeConfig
  getCache(): FlatTreeCache
  addNodesToCache(nodes: FlatTreeNode[]): void
  getNode(id: string | number): FlatTreeNode | undefined
  getChildren(parentId: string | number | null): FlatTreeNode[]
  getRoots(): FlatTreeNode[]
  buildNestedTree(rootId?: string | number | null): NestedTreeNode[]
  enrichNodes(): void
  on(event: string, callback: EventCallback): void
  off(event: string, callback: EventCallback): void
}

/**
 * DataTable 数据接口（纯数据结构，用于序列化）
 */
export interface IDataTableData extends IBindingContextData {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  rows: IDataRowWithPermission[]  // 必需：支持权限的数据行
  contexts?: Record<string, IBindingContextData>
  
  // 扩展属性
  loading?: boolean
  error?: string
}

/**
 * DataTable 接口（运行时接口，包含方法）
 */
export interface IDataTable extends IBindingContext {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  rows: IDataRowWithPermission[]  // 必需：支持权限的数据行
  contexts?: Record<string, IBindingContext>
  
  // 扩展属性
  loading?: boolean
  error?: string
}

// ==================== 依赖类型和过滤表达式 ====================

/**
 * 依赖类型：当前行 / 选中行 / 全部行 / 可自定义扩展
 */
export type DependencyType =
  | 'currentRow'   // 依赖父上下文的 currentRow
  | 'selectedRows' // 依赖父上下文的 selectedRows
  | 'allRows'      // 依赖父上下文的全部行 (对于子Context，即为过滤后的行)
  | 'pagedRows'    // 依赖父上下文的分页行
  | string         // 预留自定义类型

/**
 * 排序方向
 */
export type SortDirection = 'asc' | 'desc' | 'ASC' | 'DESC'

/**
 * 排序表达式：单个字段或多个字段组合排序
 */
export type SortExpression =
  // 单字段排序
  | {
      field: string           // 字段名
      direction: SortDirection // 排序方向
    }
  // 多字段排序
  | {
      fields: Array<{
        field: string
        direction: SortDirection
      }>
    }

/**
 * 过滤操作符
 */
export type FilterOperator =
  | '=='  | '!='  | '>'   | '>='  | '<'   | '<='
  | 'in'  | 'not in' | 'like' | 'not like'
  | 'is null' | 'is not null'
  | 'between' | 'not between'
  | 'startsWith' | 'endsWith' | 'contains'

/**
 * 通用 JSON 过滤表达式节点定义
 */
export type FilterExpression =
  // 单一条件节点
  | { 
      field: string
      op: FilterOperator
      value: unknown
    }
  // 与 / 或 逻辑组合
  | { 
      type: 'and' | 'or'
      children: FilterExpression[]
    }
  // 条件取反（保留 field, op, value）
  | { 
      type: '!condition'
      field: string
      op: FilterOperator
      value: unknown
    }
  // 逻辑取反组合
  | { 
      type: '!and' | '!or'
      children: FilterExpression[]
    }
  // 函数调用节点
  | { 
      func: string
      args: unknown[]
    }

// ==================== DataRelation 定义 ====================

/**
 * DataRelation：绑定上下文（视图）之间的关系配置
 * 
 * ⚠️ 核心概念：
 * - 关系主体是 BindingContext（视图实例），不是 DataTable（数据表）
 * - 同一表可有多个视图，每个视图有独立的关系配置
 * - 父视图状态变化 → 触发子视图通过 filterExpression 动态过滤
 * 
 * @example
 * ```typescript
 * {
 *   parentTable: 'Orders',
 *   parentContextId: 'currentOrder',      // 父视图
 *   childTable: 'OrderDetails',
 *   childContextId: 'relatedDetails',     // 子视图
 *   dependencyType: 'currentRow',
 *   filterExpression: { field: 'orderId', op: '==', value: { func: 'parentRow.id', args: [] } }
 * }
 * ```
 */
export interface DataRelation {
  parentTable: string             // 父表名（数据源标识）
  parentContextId?: string        // 🎯 父上下文 ID（视图标识，默认 'default'）
  
  childTable: string              // 子表名（数据源标识）
  childContextId?: string         // 🎯 子上下文 ID（视图标识，默认 'default'）
  
  dependencyType: DependencyType  // 依赖类型：currentRow | selectedRows | allRows | pagedRows
  filterExpression: FilterExpression // 通用 JSON 过滤表达式（定义如何从父上下文过滤子上下文）
  cascadeUpdate?: boolean         // 是否级联更新
  cascadeDelete?: boolean         // 是否级联删除
  autoLoad?: boolean              // 是否自动加载子表数据（用于 currentRow/selectedRows 依赖）
  
  // 扩展：关系名称
  relationName?: string           // 关系名称，便于引用
}

// ==================== DataSet 定义 ====================

/**
 * DataSet 数据接口（纯数据，用于序列化）
 * 
 * 用途：JSON 序列化、网络传输、存储
 * 特征：只包含数据字段，无方法
 * 
 * @example
 * ```typescript
 * const data: IDataSetData = {
 *   dataSetName: 'MyData',
 *   tables: { Users: { tableName: 'Users', columns: [], rows: [] } }
 * }
 * ```
 */
export interface IDataSetData {
  dataSetName: string
  tables: Record<string, IDataTableData>  // 纯数据表
  relations?: DataRelation[]
  version?: number
  pageId?: string
}

/**
 * DataSet 配置接口（用于构造函数）
 * 
 * 用途：创建 DataSet 实例时的配置
 * 特征：扩展数据层，增加可选的运行时配置
 * 
 * @example
 * ```typescript
 * const config: IDataSetConfig = {
 *   dataSetName: 'MyData',
 *   tables: { Users: tableData },
 *   autoLoadRelations: true,
 *   dataLoader: async (tableName) => fetchData(tableName)
 * }
 * const ds = new DataSet(config)
 * ```
 */
export interface IDataSetConfig extends IDataSetData {
  autoLoadRelations?: boolean
  dataLoader?: (tableName: string) => Promise<IDataRow[]>
}

/**
 * DataSet 运行时接口（包含方法）
 * 
 * 用途：运行时操作的接口定义
 * 特征：包含运行时方法和状态管理
 */
export interface IDataSet extends IDataSetData {
  // 覆盖为运行时类型
  tables: Record<string, IDataTable>  // 运行时表实例
  autoLoadRelations?: boolean
  
  // 数据访问
  getTable(tableName: string): IDataTable | undefined
  
  // 关系管理
  updateRelatedTables(tableName: string, contextId?: string): void
  notifySubscribers(tableName: string, contextId?: string): void
  
  // 事件系统
  subscribe(tableName: string, contextId: string, callback: () => void): () => void
  on(event: string, handler: EventCallback): void
  off(event: string, handler: EventCallback): void
  emit(event: string, data: unknown): void
  
  // 序列化
  toData(): IDataSetData
  toJSON(): string
}

// ==================== 辅助类型 ====================

/**
 * 过滤结果
 */
export interface FilterResult {
  rows: IDataRow[]
  count: number
}

/**
 * 过滤上下文接口（用于主从视图关联过滤）
 * 
 * 用途：为子视图过滤提供父视图的当前行/选中行数据
 * 
 * @example
 * - `parentRow.id` → 父视图单行关联
 * - `IN(parentRows, 'id')` → 父视图多行关联
 */
export interface FilterContext {
  parentRow?: IDataRowWithPermission
  parentRows?: IDataRowWithPermission[]
  variables?: Record<string, unknown>
}

// ==================== 自引用树（Self-Reference Tree）====================

/**
 * 树配置
 */
export interface TreeConfig {
  mode: 'flat' | 'nested'   // 模式：扁平化 或 嵌套结构
  tableName?: string         // 表名（多表支持）
  idField?: string           // ID 字段名，默认 'id'
  parentIdField?: string     // 父 ID 字段名，默认 'parentId'
  textField?: string         // 显示文本字段，默认 'name'
  depthLimit?: number        // 深度限制
  lazy?: boolean             // 是否启用懒加载，默认 true
}

/**
 * 扁平树节点
 */
export interface FlatTreeNode {
  id: string | number        // 节点 ID
  parentId?: string | number | null // 父节点 ID（根节点为 null）
  name: string               // 节点名称
  level?: number             // 层级（0 表示根节点）
  hasChildren?: boolean      // 是否有子节点
  isLoaded?: boolean         // 子节点是否已加载
  [key: string]: unknown     // 其他业务字段
}

/**
 * 嵌套树节点
 */
export interface NestedTreeNode extends FlatTreeNode {
  children: NestedTreeNode[] // 子节点数组
}

/**
 * 扁平树缓存（用于懒加载）
 */
export type FlatTreeCache = Record<string | number, FlatTreeNode>

/**
 * 自引用表（扩展 IDataTable）
 */
export interface SelfReferenceTable extends IDataTable {
  treeConfig: TreeConfig     // 树配置
  flatTreeCache?: FlatTreeCache // 扁平树缓存（懒加载模式）
  
  // 扩展方法（运行时添加）
  loadChildren?(parentId: string | number | null): Promise<FlatTreeNode[]>
  expandToNode?(targetId: string | number): Promise<void>
  searchNodes?(keyword: string): Promise<FlatTreeNode[]>
}

/**
 * 树路径信息
 */
export interface TreePath {
  pathIds: Array<string | number>  // 路径 ID 列表（从根到目标）
  pathNodes?: FlatTreeNode[]        // 路径节点列表
}

/**
 * 树搜索结果
 */
export interface TreeSearchResult {
  matchedNodes: FlatTreeNode[]      // 匹配的节点
  paths: Record<string | number, TreePath> // 每个节点的路径
}
