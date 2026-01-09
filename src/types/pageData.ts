/**
 * PageData 完整解决方案 - TypeScript 类型定义
 * 参考：https://ligh60.blog.csdn.net/article/details/150585411
 */

// ==================== 基础类型 ====================

/**
 * 数据行：键值对结构
 */
export type DataRow<T = any> = Record<string, T>

/**
 * 绑定上下文：包含组件绑定和选中状态
 */
export interface BindingContext {
  componentID?: string      // 绑定组件的唯一标识
  currentRow?: DataRow      // 当前选中行
  selectedRows?: DataRow[]  // 批量选中行集合
}

/**
 * 列定义：描述表中每个字段的元数据
 */
export interface DataColumn {
  columnName: string        // 字段名称，必须唯一
  dataType: string          // 数据类型，如 'string'、'number'、'date'
  allowDBNull?: boolean     // 是否允许空值
  defaultValue?: any        // 默认值
  isPrimaryKey?: boolean    // 是否主键
  autoIncrement?: boolean   // 是否自增
  caption?: string          // 显示名称
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
 * DataTable：继承 BindingContext，表自带默认上下文
 */
export interface DataTable extends BindingContext {
  tableName: string           // 表名
  columns: DataColumn[]       // 字段定义列表
  api?: CrudApi               // 可选 CRUD 接口组
  rows: DataRow[]             // 数据行集合
  contexts?: BindingContext[] // 额外上下文集合（多视图绑定）
  _originalRows?: DataRow[]   // 🔒 缓存原始完整数据，用于过滤操作
  
  // 扩展：与现有架构兼容
  loading?: boolean           // 加载状态
  error?: string              // 错误信息
  
  // 分页状态
  pagination?: {
    pageIndex?: number        // 当前页码（从1开始）
    pageSize?: number         // 每页大小
    total?: number            // 总记录数
    totalPages?: number       // 总页数
  }
}

// ==================== 依赖类型和过滤表达式 ====================

/**
 * 依赖类型：当前行 / 选中行 / 全部行 / 可自定义扩展
 */
export type DependencyType =
  | 'currentRow'   // 依赖父上下文的 currentRow
  | 'selectedRows' // 依赖父上下文的 selectedRows
  | 'allRows'      // 依赖父上下文的全部行
  | 'pagedRows'    // 依赖父上下文的分页行
  | 'filteredRows' // 依赖父上下文的过滤后行
  | string         // 预留自定义类型

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
      value: any
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
      value: any
    }
  // 逻辑取反组合
  | { 
      type: '!and' | '!or'
      children: FilterExpression[]
    }
  // 函数调用节点
  | { 
      func: string
      args: any[]
    }

// ==================== DataRelation 定义 ====================

/**
 * DataRelation：父子表关系配置
 */
export interface DataRelation {
  parentTable: string             // 父表名
  parentContextOrder?: number     // 父上下文序号，缺省表示默认上下文
  childTable: string              // 子表名
  childContextOrder?: number      // 子上下文序号，缺省表示默认上下文
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
 * DataSet：整体数据集管理
 */
export interface DataSet {
  dataSetName: string       // 数据集名称
  tables: DataTable[]       // 所有表定义
  relations?: DataRelation[] // 可选关系配置
  version?: number          // 版本号，用于热加载或迁移
  
  // 扩展：页面级配置
  pageId?: string           // 关联的页面ID
  autoLoadRelations?: boolean // 是否自动加载关系数据
}

// ==================== 辅助类型 ====================

/**
 * 表查找结果
 */
export interface TableLookupResult {
  table: DataTable
  context: BindingContext
}

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
  variables?: Record<string, any>
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
  [key: string]: any         // 其他业务字段
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
 * 自引用表（扩展 DataTable）
 */
export interface SelfReferenceTable extends DataTable {
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
