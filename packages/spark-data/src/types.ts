/**
 * SPARK 数据空间类型定义
 *
 * 数据模型、权限、过滤/排序、关系、树 的唯一类型源
 */

import type { DataTable } from './data-table'
import type { DataView as SparkDataView } from './data-view'

// ===== 视图变更事件（独立事件模型） =====

/**
 * DataSet 级视图变更处理器映射
 *
 * 用于 `DataSet.onAnyViewChange()`：
 * 订阅者按需注册感兴趣的事件类型，每个回调接收 `(tableName, viewId, ...payload)`。
 *
 * @example
 * ```ts
 * dataSet.onAnyViewChange({
 *   currentRowChanged(tableName, viewId, currentRow, originatorId) {
 *     syncCurrentRowToUI(tableName, viewId, currentRow)
 *   },
 *   cleared(tableName, viewId) {
 *     clearUI(tableName, viewId)
 *   },
 * })
 * ```
 */
export interface ViewChangeHandlers {
  currentRowChanged?: (tableName: string, viewId: string, currentRow: IDataRow | null, originatorId?: string) => void
  selectedRowsChanged?: (tableName: string, viewId: string, selectedRows: IDataRow[], originatorId?: string) => void
  rowsChanged?: (tableName: string, viewId: string) => void
  cleared?: (tableName: string, viewId: string) => void
  requestStateChanged?: (tableName: string, viewId: string, requestState: RequestState) => void
  mutatingChanged?: (tableName: string, viewId: string, mutating: boolean) => void
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

// ── 主键值类型 ─────────────────────────────

/**
 * 主键值类型——始终为标量。
 *
 * 多字段主键由 DataView 自动合成为 `_pk` 计算列（`field1+field2+...`），
 * 因此内部所有 PK 操作均使用单一标量值，无需 CompositePkValue。
 */
export type PkValue = string | number

// ── 数据行 ──────────────────────────────────

/** 数据行（带权限） */
export type IDataRow = Record<string, unknown> & {
  _perm?: IInstancePermission
}

/** 数据源（带权限、分页和元数据） */
export interface IDataSource {
  rows?: IDataRow[]
  _modelPerm?: IModelPermission
  total?: number
  page?: number
  pageSize?: number
  /** 当前聚焦行（UI 高亮行 / 级联父行） */
  currentRow?: IDataRow | null
  /** 当前选中行集合（勾选行 / 级联选中行） */
  selectedRows?: IDataRow[]
  /** 视图聚合汇总行（由 view.aggregates 配置驱动，行变更后自动重算） */
  summaryRow?: Readonly<IDataRow>
  /** 选中行聚合汇总行（仅对 selectedRows 执行聚合，选中/数据变更后自动重算） */
  selectionSummaryRow?: Readonly<IDataRow>

  // ===== 表元数据（列定义、表名）=====

  /** 列定义数组（只读，来自 DataTable.columns）。UI 组件据此渲染表头 / 表单标签 */
  columns?: readonly DataColumn[]
  /** 表名（来自 DataView.tableName） */
  tableName?: string

  // ===== 选中值序列化（el-select / el-radio-group 等值型组件消费） =====

  /** 选中行序列化值（按 valueField + selectionDelimiter 拼接，可 v-model 绑定） */
  value?: string
  /** 当前行显示标签（按 labelField 或主键回退） */
  label?: string | null
  /** 选中行标签数组 */
  labels?: string[]

  // ===== 请求状态（加载指示器消费） =====

  /** 数据加载状态（Idle / Loading / Loaded / Failed） */
  requestState?: RequestState
}

// ===== 数据模型类型 =====

/** 计算列函数签名：接收当前行，返回计算值 */
export type ComputedColumnFn = (row: IDataRow) => unknown

// ===== 聚合类型 =====

/**
 * 视图聚合函数类型。
 *
 * 配置在 `IViewMetadata.aggregates`（`view.aggregates`）上，DataView 自动对当前 rows
 * 计算汇总值，结果写入 `view.summaryRow[columnName]`。
 *
 * - `sum`   — 求和（非数字视为 0）
 * - `count` — 非 null/undefined 值计数
 * - `avg`   — 算术平均（空集 → 0）
 * - `min`   — 最小值（空集 → undefined）
 * - `max`   — 最大值（空集 → undefined）
 * - `join`  — 字符串拼接（逗号分隔，跳过 null/undefined/空串；空集 → ''）
 */
export type AggregateType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'join'

/**
 * 单个聚合列配置。
 *
 * - `type`  — 聚合函数（sum / count / avg / min / max / join）
 * - `field` — 源字段名（省略时默认与 key 同名）
 * - `label` — 显示标题（UI 渲染表头 / 汇总标签使用）
 *
 * @example
 * ```json
 * {
 *   "totalPrice": { "type": "sum", "field": "price", "label": "总价" },
 *   "avgScore":   { "type": "avg", "field": "score", "label": "平均分" }
 * }
 * ```
 */
export interface AggregateColumnConfig {
  /** 聚合函数类型 */
  type: AggregateType
  /** 源字段名（聚合哪个字段的值；省略时默认取与 key 同名的字段） */
  field?: string
  /** 显示标题（UI 渲染表头 / 汇总标签使用） */
  label?: string
  /** join 聚合分隔符（默认 ', '），仅 type='join' 时有效 */
  separator?: string
}

// ===== 列类型系统 =====

/**
 * 列类型字面量联合——涵盖 DataValidator 中所有已知类型。
 *
 * 末尾的 `(string & {})` 保持对自定义类型的开放性，同时不影响已知值的自动补全。
 */
export type ColumnType =
  // 数字类
  | 'number' | 'int' | 'integer' | 'decimal' | 'float' | 'double'
  // 字符串类
  | 'string' | 'varchar' | 'text'
  // 布尔
  | 'boolean' | 'bool'
  // 日期
  | 'date' | 'datetime' | 'time'
  // 复合
  | 'object' | 'array'
  // 枚举
  | 'enum'
  // 自定义扩展（保留开放，不影响已知值提示）
  | (string & {})

/**
 * ColumnType → TypeScript 类型映射表。
 *
 * 用于类型匹配、泛型推断，也可用 `declare module` 扩展自定义类型映射。
 *
 * @example
 * ```ts
 * declare module '@spark-view/spark-data' {
 *   interface ColumnTypeMap {
 *     json: Record<string, unknown>
 *   }
 * }
 * ```
 */
export interface ColumnTypeMap {
  // 数字类
  number: number; int: number; integer: number
  decimal: number; float: number; double: number
  // 字符串类
  string: string; varchar: string; text: string
  // 布尔
  boolean: boolean; bool: boolean
  // 日期
  date: Date | string; datetime: Date | string; time: string
  // 复合
  object: Record<string, unknown>; array: unknown[]
  // 枚举
  enum: string | number
}

/**
 * 根据 ColumnType 字符串推断对应的 TypeScript 值类型。
 *
 * @example
 * ```ts
 * type T = InferColumnValue<'number'>  // number
 * type S = InferColumnValue<'date'>    // Date | string
 * type U = InferColumnValue<'json'>    // unknown（未注册到 ColumnTypeMap）
 * ```
 */
export type InferColumnValue<T extends ColumnType> =
  T extends keyof ColumnTypeMap ? ColumnTypeMap[T] : unknown

/**
 * 数据列定义
 *
 * 分为两个部分：
 * - **数据属性**（name, type, isPrimaryKey, ...）：描述数据结构，供校验 / 计算列 / CRUD 使用
 * - **渲染属性**（label, visible, editable, ...）：描述 UI 呈现方式，供表格 / 表单组件消费
 *
 * 渲染属性均为可选，不影响纯数据层使用。
 * UI 组件通过 `IDataSource.columns` 或 `DataView.columns` 读取列元数据。
 */
export interface DataColumn {
  name: string
  /**
   * 列值类型。已知类型见 `ColumnType`，支持自定义扩展（通过 `ColumnTypeMap` 声明合并）。
   *
   * 常用值：`'string'` | `'number'` | `'boolean'` | `'date'` | `'datetime'`
   */
  type: ColumnType
  /** 列标题（UI 表头 / 表单标签 / 描述列标题）。未设置时 UI 回退到 `name` */
  label?: string
  allowDBNull?: boolean
  defaultValue?: unknown
  isPrimaryKey?: boolean
  autoIncrement?: boolean

  // ===== 计算字段属性 =====

  /**
   * 计算列表达式（JS 表达式字符串）。
   *
   * 行字段直接引用（无需前缀），外部上下文通过 `ctx` 对象引用，
   * 子视图聚合通过 `$sum` / `$count` / `$avg` / `$min` / `$max` / `$list` 函数。
   *
   * @example
   * `"price * qty"`
   * `"firstName + ' ' + lastName"`
   * `"ctx.taxRate ? amount * ctx.taxRate : amount"`
   * `"$sum('OrderItems', 'amount')"`
   * `"$sum('OrderItems@grid', 'amount')"`
   * `"$count('OrderItems')"` 
   */
  computeExpression?: string
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
  page?: number
  pageSize?: number
  /** 树结构字段配置（idField/parentIdField/textField/depthLimit/lazy/treeMode），属于视图层关注点 */
  treeConfig?: TreeConfig
  /**
   * 值字段名（用于 value getter/setter 序列化）。
   * 未指定时回退到主键字段。
   *
   * - 单字段：`'code'` → value 返回各选中行的 code 字段值
   * - 多字段（复合值）：`['code', 'region']` → value 以 `:` 连接各字段，如 `'A:US'`
   */
  valueField?: string | string[]
  /**
   * 标签显示字段名（用于 labels / label getter，渲染 tag 时使用）。
   * 未指定时回退到主键值字符串。
   * 示例：labelField = 'name' → labels 返回各选中行的 name 字段值。
   */
  labelField?: string
  /**
   * 值序列化分隔符（默认 ','）。
   *
   * - **非空字符串**（`','` / `'|'` / `';'` 等）：多选模式，value 以此分隔多个主键值
   * - **空字符串 `''`**：单选模式，value 仅保留一个值，赋值时不拆分
   *
   * 通过 `isMultiSelect` getter 可读取当前模式。
   */
  selectionDelimiter?: string
  /**
   * 是否在 DataSet 初始化后自动加载数据（默认 false）。
   *
   * 设为 `true` 时，渲染层（如 usePageDataSet）在构建 DataSet 后自动调用 `view.requestData()`，
   * 业务脚本无需在 `__init__` 中手动编写加载代码。
   * 仅对有配置 `api` 且为 default 视图的主表有意义。
   */
  autoLoad?: boolean
  /**
   * 设置分页、排序、过滤等参数后是否自动刷新数据（默认 false）。
   *
   * 设为 `true` 时，调用 `setPage()` / `setPageSize()` / `setSort()` / `setFilter()`
   * 会在修改参数后自动调用 `refresh()`，消费层无需手动触发刷新。
   */
  autoRefresh?: boolean
  /**
   * 增删改是否自动提交到服务端（默认 `false`）。
   *
   * - `false`（默认）：`addRow` / `editRowById` / `removeRow` 仅修改内存，
   *   需调用 `saveChanges()` 批量提交。
   * - `true`：每次 `addRow` / `editRowById` / `removeRow` 立即调用对应网络 CRUD 方法。
   */
  autoCommit?: boolean
  /**
   * 视图级聚合配置——输出名 → 聚合列配置。
   *
   * 结果写入 `view.summaryRow / selectionSummaryRow`，行变更后自动重算。
   * 聚合配置与列定义（`DataColumn.computeExpression`）完全独立：
   * 列负责逐行求值，聚合负责整列汇总。
   *
   * @example
   * ```json
   * {
   *   "aggregates": {
   *     "totalPrice": { "type": "sum", "field": "price", "label": "总价" },
   *     "score":      { "type": "avg" }
   *   }
   * }
   * ```
   */
  aggregates?: Record<string, AggregateColumnConfig>
}

/**
 * 数据表自有元数据（不含视图层字段）
 *
 * 表级关注点：表名、列定义、API 端点、命名视图集合、加载状态。
 * 视图层关注点（rows / filter / sort / page / treeConfig 等）由 IViewMetadata 描述。
 */
export interface ITableOwnMetadata {
  tableName: string
  columns: DataColumn[]
  /**
   * CRUD API 配置。支持三种形式：
   * - 完整对象 `CrudApi`
   * - 字符串简写（RESTful 基础路径）：`"/api/users"` → 自动展开为完整 CRUD 端点
   * - `true`：从 tableName 按约定生成路径（`/api/${kebab-case(tableName)}`）
   */
  api?: CrudApi | string | boolean | undefined
  views?: Record<string, IViewMetadata> | undefined
  loading: boolean | undefined
  error: string | undefined
}

/**
 * 数据表完整元数据（配置 JSON 的扁平格式）
 *
 * = ITableOwnMetadata（表结构字段）& IViewMetadata（default 视图字段）
 *
 * **字段归属一览**
 *
 * 表结构字段（属于 DataTable，由 DataTable.fromTableData 消费）：
 *   `tableName` `columns` `api` `views` `loading` `error`
 *
 * default 视图字段（属于 DataView，由 DataView.applyViewConfig 消费）：
 *   `rows` `filterExpression` `sortExpression` `page` `pageSize`
 *   `autoCurrentFirst` `autoSelectFirst`
 *   `autoLoad` `autoRefresh` `autoCommit`
 *   `valueField` `labelField` `selectionDelimiter` `treeConfig` `aggregates`
 *
 * 扁平化原因：pagedata.json 惯例将 default 视图字段直接挂在表级，
 * 避免配置中出现 `views.default.rows` 这种冗长路径。
 * DataTable.fromTableData 通过 `data.views?.['default'] ?? data`
 * 优先读取显式的 views.default，回退到扁平化表级字段，保持两者等价。
 */
export type ITableMetadata = ITableOwnMetadata & IViewMetadata

/** 数据集元数据 */
export interface IDataSetMetadata {
  /**
   * Schema 格式版本（用于未来迁移兼容）。
   * 缺失时视为 1（当前格式：default 视图字段扁平化到 ITableMetadata）。
   */
  schemaVersion?: number
  dataSetName: string
  tables: Record<string, ITableMetadata>
  relations: DataRelation[] | undefined
  /** 业务数据版本号（乐观锁），与 schemaVersion 含义不同 */
  version: number | undefined
  pageId: string | undefined
}

// ===== 过滤和排序类型 =====

/** 依赖类型 */
export type DependencyType =
  | (string & {})
  | 'currentRow'
  | 'selectedRows'
  | 'allRows'
  | 'pagedRows'

/** 排序方向（小写） */
export type SortDirection = 'asc' | 'desc'

/** 排序规则项（direction 默认 'asc'） */
export interface SortField {
  field: string
  direction?: SortDirection
}

/**
 * 排序表达式——统一数组格式，UI 和服务端提交共用。
 *
 * @example
 * ```ts
 * // 单字段升序（direction 可省略，默认 'asc'）
 * [{ field: 'name' }]
 * // 多字段排序
 * [{ field: 'age', direction: 'desc' }, { field: 'name' }]
 * ```
 */
export type SortExpression = SortField[]

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

/**
 * 数据关系定义
 *
 * 简写模式：只需 `parentTable` + `childTable` + `childField`，系统自动推导其余字段。
 * ```json
 * { "parentTable": "Users", "childTable": "Orders", "childField": "userId" }
 * ```
 * 等价于完整写法：
 * ```json
 * {
 *   "parentTable": "Users", "childTable": "Orders",
 *   "dependencyType": "currentRow",
 *   "filterExpression": { "field": "userId", "op": "==", "value": { "func": "FIELD", "args": ["id"] } }
 * }
 * ```
 */
export interface DataRelation {
  parentTable: string
  parentViewId?: string
  childTable: string
  childViewId?: string
  /** 父表中用于匹配的字段（默认取父视图 primaryKey，通常为 'id'） */
  parentField?: string
  /** 子表中用于匹配的字段——简写模式必填；完整模式不填时从 filterExpression.field 推断 */
  childField?: string
  /** 依赖类型（默认 'currentRow'） */
  dependencyType?: DependencyType
  /**
   * 过滤表达式——完整模式手动指定；简写模式可省略，系统根据 childField/parentField 自动生成。
   * 规范化后此字段一定存在（DataSet 构造函数保证）。
   */
  filterExpression?: FilterExpression
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
  /** Schema 格式版本（默认 1） */
  readonly schemaVersion: number
  /** 业务数据版本号（乐观锁） */
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
   * 严格作用于本 DataSet 实例，多实例并存时互不干扰（替代全局 event-bus）。
   * 订阅时遍历当前已存在的所有视图；如需监听后续动态创建的视图，可在创建后重新订阅。
   *
   * @returns 取消订阅函数（组件卸载时调用）
   */
  onAnyViewChange(handlers: ViewChangeHandlers): () => void
  /**
   * 触发所有标记了 `autoLoad: true` 的 default 视图自动加载。
   * 渲染层构建 DataSet 后调用；业务脚本无需手动编写加载代码。
   */
  triggerAutoLoad(): void
  /**
   * 销毁 DataSet 及其所有 DataTable/DataView 的资源。
   * 清理所有事件订阅、委托、共享 HTTP 客户端引用。
   */
  destroy(): void
  /** 数据集是否已被销毁 */
  readonly destroyed: boolean
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
