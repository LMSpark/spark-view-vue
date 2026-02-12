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

import type { IDataRow as IDataRowBase, HttpRequestConfig } from '@spark-view/spark-utils'

// 重新导出基础类型（数据空间需要这些类型）
export type IDataRow = IDataRowBase
export type { HttpRequestConfig }

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
  currentRow?: IDataRow | null
  selectedRows?: IDataRow[]
  rows?: IDataRow[]
  originalRows?: IDataRow[]
  
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
 * 
 * 典型使用场景：
 * - el-table 的 dataKey 绑定
 * - 主从表联动（通过 filterExpression）
 * - 表格行选中状态管理
 */
export interface IBindingContext extends IBindingContextData {
  // ===== 运行时必需字段（覆盖可选） =====
  currentRow: IDataRow | null
  selectedRows: IDataRow[]
  rows: IDataRow[]
  hostTable: string
  contextId: string
  
  // ===== 核心方法（运行时必需） =====
  setCurrentRow(row: IDataRow | null, skipNotify?: boolean): void
  setSelectedRows(rows: IDataRow[], skipNotify?: boolean): void
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

// ==================== HTTP API 配置 ====================

/**
 * HTTP 端点定义：描述单个 API 调用的属性
 * 
 * 基于统一的 HttpRequestConfig，专注于静态 API 配置
 * 主要用于 API 端点的声明式定义，不包含运行时选项
 */
export interface HttpEndpoint extends Pick<HttpRequestConfig,
  'url' | 'method' | 'headers' | 'params' | 'pathParams' | 'bodySchema'
> {}

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
  rows: IDataRow[]
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
  rows: IDataRow[]
  contexts?: Record<string, IBindingContext>
  
  // 扩展属性
  loading?: boolean
  error?: string
}

/**
 * DataTable 增强接口（带 API 方法）
 * 
 * 扩展：在基础 IDataTable 上增加 CRUD 运行时方法
 * 
 * 前置条件：
 * - 必须注入 ApiAdapter（通过 setApiAdapter 方法）
 * - api 配置中必须定义对应的端点（如 api.list）
 * 
 * 自动行为：
 * - API 调用成功后自动更新 DataTable.rows
 * - 自动设置 loading 状态
 * - 错误时设置 error 属性
 * 
 * 典型用法：
 * ```typescript
 * const usersTable = dataSet.getTable('Users') as IDataTableWithApi
 * 
 * // 列表查询
 * await usersTable.list({ status: 'active' })
 * 
 * // 创建记录
 * const newUser = await usersTable.create({ name: 'John', email: 'john@example.com' })
 * 
 * // 更新记录
 * await usersTable.update(123, { name: 'John Doe' })
 * 
 * // 删除记录
 * await usersTable.delete(123)
 * ```
 */
export interface IDataTableWithApi extends IDataTable {
  /**
   * 设置 HTTP 请求实例（由 DataSet 或应用层注入）
   * @param request - Request 实例（来自 @spark-view/spark-utils）
   */
  setApiAdapter(request: unknown): void
  
  /**
   * 列表查询
   * 
   * @param params - 查询参数（会作为 queryParams 或 pathParams）
   * @returns 数据行数组
   * 
   * 前置条件：api.list 必须存在
   * 副作用：成功后会替换 this.rows
   * 
   * @example
   * ```typescript
   * // 分页查询
   * await table.list({ page: 1, pageSize: 20 })
   * 
   * // 条件过滤
   * await table.list({ status: 'active', role: 'admin' })
   * ```
   */
  list(params?: Record<string, unknown>): Promise<IDataRow[]>
  
  /**
   * 创建记录
   * 
   * @param data - 新记录数据
   * @returns 创建后的记录（通常包含服务器生成的 id）
   * 
   * 前置条件：api.create 必须存在
   * 副作用：成功后会将新记录追加到 this.rows
   * 
   * @example
   * ```typescript
   * const newUser = await table.create({
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * })
   * console.log(newUser.id) // 123
   * ```
   */
  create(data: IDataRow): Promise<IDataRow>
  
  /**
   * 更新记录
   * 
   * @param id - 记录 ID
   * @param data - 更新的字段（部分更新）
   * @returns 更新后的完整记录
   * 
   * 前置条件：api.update 必须存在
   * 副作用：成功后会更新 this.rows 中的对应记录
   * 
   * @example
   * ```typescript
   * await table.update(123, { name: 'Jane Doe' })
   * ```
   */
  update(id: string | number, data: Partial<IDataRow>): Promise<IDataRow>
  
  /**
   * 删除记录
   * 
   * @param id - 记录 ID
   * @returns 是否删除成功
   * 
   * 前置条件：api.delete 必须存在
   * 副作用：成功后会从 this.rows 中移除对应记录
   * 
   * @example
   * ```typescript
   * await table.delete(123)
   * ```
   */
  delete(id: string | number): Promise<boolean>
  
  /**
   * 批量创建
   * 
   * @param data - 新记录数组
   * @returns 创建后的记录数组
   * 
   * 前置条件：api.batch.create 必须存在
   * 副作用：成功后会将新记录追加到 this.rows
   * 
   * @example
   * ```typescript
   * const newUsers = await table.batchCreate([
   *   { name: 'User 1', email: 'user1@example.com' },
   *   { name: 'User 2', email: 'user2@example.com' }
   * ])
   * ```
   */
  batchCreate(data: IDataRow[]): Promise<IDataRow[]>
  
  /**
   * 批量更新
   * 
   * @param updates - 更新配置数组
   * @returns 更新后的记录数组
   * 
   * 前置条件：api.batch.update 必须存在
   * 副作用：成功后会更新 this.rows 中的对应记录
   * 
   * @example
   * ```typescript
   * await table.batchUpdate([
   *   { id: 123, data: { status: 'active' } },
   *   { id: 124, data: { status: 'inactive' } }
   * ])
   * ```
   */
  batchUpdate(updates: Array<{ id: string | number; data: Partial<IDataRow> }>): Promise<IDataRow[]>
  
  /**
   * 批量删除
   * 
   * @param ids - 记录 ID 数组
   * @returns 是否删除成功
   * 
   * 前置条件：api.batch.delete 必须存在
   * 副作用：成功后会从 this.rows 中移除对应记录
   * 
   * @example
   * ```typescript
   * await table.batchDelete([123, 124, 125])
   * ```
   */
  batchDelete(ids: Array<string | number>): Promise<boolean>
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
 * DataRelation：父子表关系配置
 */
export interface DataRelation {
  parentTable: string             // 父表名
  parentContextId?: string        // 父上下文 ID（可选，内核初始化时会自动设置为 'default'）
  
  childTable: string              // 子表名
  childContextId?: string         // 子上下文 ID（可选，内核初始化时会自动设置为 'default'）
  
  dependencyType: DependencyType  // 依赖类型
  filterExpression: FilterExpression // 通用 JSON 过滤表达式
  cascadeUpdate?: boolean         // 是否级联更新
  cascadeDelete?: boolean         // 是否级联删除
  autoLoad?: boolean              // 是否自动加载子表数据（用于 currentRow/selectedRows 依赖）
  
  // 扩展：关系名称
  relationName?: string           // 关系名称，便于引用
}

// ==================== DataSet 定义 ====================

/**
 * DataSet 接口 (ISP: 接口隔离原则 - 分离数据访问和事件订阅)
 */
export interface IDataSet {
  dataSetName: string
  tables: Record<string, IDataTable>
  relations?: DataRelation[]
  version?: number
  pageId?: string
  autoLoadRelations?: boolean
  
  // 必需方法
  updateRelatedTables(tableName: string, contextId?: string): void
  notifySubscribers(tableName: string, contextId?: string): void
  emit(event: string, data: unknown): void
  
  // 事件订阅方法 (新增)
  subscribe(tableName: string, contextId: string, callback: () => void): () => void
  on(event: string, handler: EventCallback): void
  off(event: string, handler: EventCallback): void
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
 * 过滤上下文接口（用于主从表关联过滤）
 * 
 * 作用域：单次主从表过滤操作的临时上下文
 * 生命周期：过滤表达式解析时创建，过滤完成后销毁
 * 
 * 用途：
 * - 为从表过滤提供主表的当前行/选中行数据
 * - 支持主从表级联过滤（如订单明细 ↔ 订单主表）
 * - 提供全局变量访问（variables）
 * 
 * 典型使用场景：
 * - filterExpression: "parentRow.id" → 主表单行关联
 * - filterExpression: "IN(parentRows, 'id')" → 主表多行关联
 * - 通过 variables 传递额外的过滤参数
 */
export interface FilterContext {
  parentRow?: IDataRow
  parentRows?: IDataRow[]
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
