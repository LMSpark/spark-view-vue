/**
 * PageData 完整解决方案 - TypeScript 类型定义
 * 参考：https://ligh60.blog.csdn.net/article/details/150585411
 */

// ==================== 基础类型 ====================

/**
 * 数据行：键值对结构
 */
export type DataRow<T = unknown> = Record<string, T>

/**
 * 绑定上下文接口（纯数据结构，用于序列化）
 */
export interface IBindingContext {
  currentRow?: DataRow | null
  selectedRows?: DataRow[]
  rows?: DataRow[]
  _originalRows?: DataRow[]
  
  // 宿主信息
  _hostTable?: string
  _contextId?: string
  
  // 初始配置
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  autoSelectFirst?: boolean        // 自动选中第一行
  autoDeselectOnEmpty?: boolean    // 数据清空时自动取消选中
  
  // 分页状态
  pagination?: {
    pageIndex?: number
    pageSize?: number
    total?: number
    totalPages?: number
  }
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
 */
export interface HttpEndpoint {
  url: string                                 // 接口地址
  method?: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE' // HTTP 方法
  headers?: Record<string, string>            // 请求头
  queryParams?: Record<string, unknown>       // URL 查询参数
  pathParams?: string[]                       // 路由参数列表
  bodySchema?: unknown                        // 请求体结构（可选）
}

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

/**
 * TreeManager 接口（树形数据管理器）
 */
export interface ITreeManager {
  setBindingContext(context: unknown): void
  getBindingContext(): unknown
  getConfig(): TreeConfig
  getCache(): FlatTreeCache
  addNodesToCache(nodes: FlatTreeNode[]): void
  getNode(id: string | number): FlatTreeNode | undefined
  getChildren(parentId: string | number | null): FlatTreeNode[]
  getRoots(): FlatTreeNode[]
  buildNestedTree(rootId?: string | number | null): NestedTreeNode[]
  enrichNodes(): void
  on(event: string, callback: Function): void
  off(event: string, callback: Function): void
}

/**
 * DataTable 接口（纯数据结构，用于序列化）
 */
export interface IDataTable extends IBindingContext {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  rows: DataRow[]
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
  updateRelatedTables(tableName: string): void
  notifySubscribers(tableName: string, contextId?: string): void
  emit(event: string, data: unknown): void
  
  // 事件订阅方法 (新增)
  subscribe(tableName: string, contextId: string, callback: () => void): void
  on(event: string, handler: Function): void
  off(event: string, handler: Function): void
}

// ==================== 辅助类型 ====================

/**
 * 过滤结果
 */
export interface FilterResult {
  rows: DataRow[]
  count: number
}

/**
 * 过滤上下文（用于解析时传递父表数据）
 */
export interface FilterContext {
  parentRow?: DataRow
  parentRows?: DataRow[]
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
