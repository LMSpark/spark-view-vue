/**
 * SPARK 数据空间类型定义
 *
 * 数据模型、权限、过滤/排序、关系、树 的唯一类型源
 */
import type { DataTable } from './data-table'
import type { DataView as SparkDataView } from './data-view'
import type { LoggerApi } from '@spark-view/spark-utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>> {
  on<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  off<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  emit<K extends string & keyof TEventMap>(event: K, ...args: TEventMap[K]): void
  removeAllListeners<K extends string & keyof TEventMap>(event?: K): void
  listenerCount<K extends string & keyof TEventMap>(event?: K): number
}

/**
 * DataSet 用到的应用服务最小形状（避免依赖上层能力体系类型）。
 */
export interface DataSetAppServices {
  router?: {
    currentRoute: unknown
  }
  tenant?: { tenantId: string; tenantName?: string; [key: string]: unknown }
  logger?: LoggerApi
}

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
  summaryChanged?: (tableName: string, viewId: string) => void
  selectionSummaryChanged?: (tableName: string, viewId: string) => void
  stateChanged?: (tableName: string, viewId: string, change: DataViewChangeEvent) => void
}

// ===== 权限类型 =====

/**
 * 实例级权限（行级）- 服务端权限快照
 *
 * 采用类似JWT的设计理念，权限信息由服务端一次性计算并返回前端，
 * 前端保存权限快照，在数据更新时回传给服务端，避免重复计算。
 */
export interface IInstancePermission {
  allowCreateChild?: boolean
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

// ── 数据源接口（分层，ISP）──────────────────

/**
 * 最小行数据源——提供行集合 + 列元数据。
 *
 * r-table 等纯列表容器仅需此接口。
 */
export interface IRowDataSource {
  rows?: readonly IDataRow[]
  /** 列定义数组（只读，来自 DataTable.columns）。UI 组件据此渲染表头 / 表单标签 */
  columns?: readonly DataColumn[]
  /** 表名（来自 DataView.tableName） */
  tableName?: string
  /** 数据加载状态（Idle / Loading / Loaded / Failed） */
  requestState?: RequestState
}

/**
 * 当前行数据源——扩展行集合，增加聚焦行 + 选中行。
 *
 * r-form / r-detail 等详情容器消费此接口。
 */
export interface ICurrentRowSource extends IRowDataSource {
  /** 当前聚焦行（UI 高亮行 / 级联父行） */
  currentRow?: IDataRow | null
  /** 当前选中行集合（勾选行 / 级联选中行） */
  selectedRows?: readonly IDataRow[]
}

/**
 * 完整数据源全量接口，包含分页、聚合结果、权限、值序列化。
 *
 * DataView 实现此接口。可将其理解为“UI 读取 DataView(API 视图)时看到的运行时数据结构”。
 *
 * 边界：
 * - DataView 对应 table + viewId 的 API 视图（含 requestData/refresh/requestState）。
 * - IDataSource 只暴露 UI 消费所需的输出字段，不承载 API 配置定义本身（例如 viewId 应由 dataKey 解析得到）。
 *
 * 1. 行级计算列：`columns[].computeExpression` 对每一行求值，结果写回该行字段。
 *    表达式可直接读取行字段，可通过 `ctx` 读取外部上下文，也可通过
 *    `$sum/$count/$avg/$min/$max/$list/$join` 读取 DataRelation 匹配到的子表行。
 * 2. 视图级聚合配置：定义在 `IViewMetadata.aggregates`，不是 `IDataSource` 字段。
 *    每个输出项包含 `type / field / separator` 等后端 API 认得的规则信息。
 * 3. 运行时聚合结果：`aggregateResult` 基于当前 `rows` 计算，`selectionAggregateResult`
 *    基于当前 `selectedRows` 计算；二者都是由 aggregates 配置生成的“聚合结果输出行”，
 *    字段名来自 aggregates 的输出 key，字段值是对应聚合计算结果。
 * 4. UI / DataKey 消费：组件可直接读取 `dataSource.aggregateResult`，也可通过
 *    `Table@aggregateResult.totalAmount` 或 `Table@selectionAggregateResult.totalAmount` 引用。
 * 5. 序列化边界：`DataView.toJson()` 只持久化 `aggregates` 配置；`aggregateResult`、
 *    `selectionAggregateResult` 和计算列写回 rows 的派生值都是运行时结果，不写入配置 JSON。
 */
export interface IDataSource extends ICurrentRowSource {
  _modelPerm?: IModelPermission
  total?: number
  page?: number
  pageSize?: number
  /**
   * 当前 `rows` 的全量聚合输出行；按视图 aggregates 配置自动计算，行变更后自动重算。
   *
   * 注意它不是单个标量，而是 `AggregateResultRow` 形状的结果容器：
   * 每个字段名来自 aggregates 的输出 key，每个字段值是对应聚合计算结果。
   * 例如 aggregates 配置了 `totalAmount`、`avgScore` 两个输出名，则结果形如：
   * `{ totalAmount: 1234, avgScore: 87.5 }`。
   * 当视图已配置 aggregates 且 rows 为空时，源码按类型填默认输出：
   * `sum/count/avg` 为 `0`，`min/max` 为 `undefined`，`join` 为空字符串。
   */
  aggregateResult?: Readonly<AggregateResultRow>
  /**
   * 当前 `selectedRows` 的选中聚合输出行；按视图 aggregates 配置自动计算，选中/数据变更后自动重算。
   *
   * 无选中行时源码直接返回空对象 `{}`，而不是按聚合类型填默认输出。
   * 选中行存在时字段结构与 aggregateResult 相同。
   */
  selectionAggregateResult?: Readonly<AggregateResultRow>

  // ===== 选中值序列化（el-select / el-radio-group 等值型组件消费） =====

  /** 选中行序列化值（按 valueField + selectionDelimiter 拼接，可 v-model 绑定） */
  value?: string
  /** 当前行显示标签（按 labelField 或主键回退） */
  label?: string | null
  /** 选中行标签数组 */
  labels?: readonly string[]
}

// ===== DataView 状态订阅契约 =====

/**
 * DataView 统一状态变化类型。
 *
 * 独立事件（rowsChanged/currentRowChanged 等）保留用于精细订阅；
 * stateChanged 用于框架适配层统一失效 snapshot，例如 Vue/React/Solid 等。
 */
export type DataViewStateChangeKind =
  | 'rows'
  | 'selection'
  | 'request'
  | 'aggregate'
  | 'mutation'
  | 'config'
  | 'cleared'

/**
 * DataView 统一状态变化事件。
 *
 * revision 是视图级全局版本；各分区 revision 用于适配层按需判断哪类状态变化。
 */
export interface DataViewChangeEvent {
  tableName: string
  viewId: string
  kinds: readonly DataViewStateChangeKind[]
  revision: number
  rowsRevision: number
  selectionRevision: number
  requestRevision: number
  aggregateRevision: number
  mutationRevision: number
  configRevision: number
  originatorId?: string
}

/** DataView 统一状态变化监听函数。 */
export type DataViewChangeListener = (change: DataViewChangeEvent) => void

/**
 * DataView 运行时快照。
 *
 * 快照是框架无关的只读读取面，供 UI 适配层转成各框架自己的响应式状态。
 * rows/currentRow/selectedRows 等仍保持 DataView 内部对象引用，不做深拷贝。
 */
export interface DataViewSnapshot extends IDataSource {
  tableName: string
  viewId: string
  rows: readonly IDataRow[]
  columns: readonly DataColumn[]
  currentRow: IDataRow | null
  selectedRows: readonly IDataRow[]
  primaryKey: string | undefined
  treeConfig: TreeConfig | undefined
  isMultiSelect: boolean
  requestState: RequestState
  total: number
  page: number
  pageSize: number
  mutating: boolean
  mutatingError: Error | null
  loadingError: Error | null
  aggregateResult: Readonly<AggregateResultRow>
  selectionAggregateResult: Readonly<AggregateResultRow>
  value: string
  label: string | null
  labels: readonly string[]
  revision: number
  rowsRevision: number
  selectionRevision: number
  requestRevision: number
  aggregateRevision: number
  mutationRevision: number
  configRevision: number
}

/**
 * 框架无关的 DataView Store 契约。
 *
 * Vue/React 等渲染层应依赖 getSnapshot + subscribe，而不是依赖具体响应式代理。
 */
export interface IDataViewStore {
  readonly tableName: string
  readonly viewId: string
  getSnapshot(): DataViewSnapshot
  subscribe(listener: DataViewChangeListener): () => void
}

// ===== 数据模型类型 =====

/** 计算列函数签名：接收当前行，返回计算值 */
export type ComputedColumnFn = (row: IDataRow) => unknown

// ===== 聚合类型 =====

/**
 * 视图聚合函数类型。
 *
 * 配置在 `IViewMetadata.aggregates`（运行时为 `view.aggregates`）上。DataView 会先
 * 对 `computeExpression` 求值，再按 aggregates 的 key 生成输出行：
 * `view.aggregateResult[key]` / `view.selectionAggregateResult[key]`。
 *
 * - `sum`   — `Number(raw ?? 0)` 累加；null/undefined 按 0，非数字会得到 NaN
 * - `count` — 非 null/undefined 值计数（空字符串也计数）
 * - `avg`   — 对可转为数字的值求平均；空集或无有效数字 → 0
 * - `min`   — 可转为数字的最小值；空集或无有效数字 → undefined
 * - `max`   — 可转为数字的最大值；空集或无有效数字 → undefined
 * - `join`  — 字符串拼接（默认 `", "` 分隔，跳过 null/undefined/空串；空集 → ''）
 */
export type AggregateType = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'join'

/** 单个聚合输出值类型（按 AggregateType 计算后得到的运行时值） */
export type AggregateResultValue = number | string | undefined

/** 视图聚合输出行（key 来自 aggregates 的输出字段名） */
export type AggregateResultRow = Record<string, AggregateResultValue>

/**
 * 单个聚合列配置。
 *
 * - `type`  — 聚合函数（sum / count / avg / min / max / join）
 * - `field` — 源字段名（省略时默认与 key 同名），可指向基础列或计算列
 * - `separator` — `join` 的字符串分隔符
 *
 * @example
 * ```json
 * {
 *   "totalPrice": { "type": "sum", "field": "price" },
 *   "avgScore":   { "type": "avg", "field": "score" }
 * }
 * ```
 */
export interface AggregateColumnConfig {
  /** 聚合函数类型 */
  type: AggregateType
  /**
   * 源字段名（聚合哪个字段的值；省略时默认取与 aggregates 的 key 同名的字段）。
   *
   * 注意：`field` 只决定从行里读哪个源字段，结果仍写入 aggregates 的 key。
   * 例如 `{ totalAmount: { type: 'sum', field: 'amount' } }` 的结果位于
   * `aggregateResult.totalAmount`，不是 `aggregateResult.amount`。
   */
  field?: string
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

  /**
   * 是否为框架计算列（如 `_pk`）。
   *
   * 计算列的值由框架自动维护，不参与序列化（`DataTable.toJson()` 自动排除）。
   * UI 组件可通过 `columns.filter(c => !c.isComputed)` 获取用户定义列。
   */
  isComputed?: boolean

  // ===== 验证属性 =====
  // 字段级验证元数据，UI 层通过 DataView.columns 读取并自动生成表单验证规则。
  // spark-data 保持框架无关，验证规则到 Element Plus FormItemRule 的转换由渲染层完成。

  /**
   * UI 必填标记。
   *
   * - `true`：表单中必填（生成 required 验证规则）
   * - 未设置时回退到 `!allowDBNull`（allowDBNull 显式为 false 也视为必填）
   *
   * @example `{ "name": "email", "type": "string", "required": true }`
   */
  required?: boolean

  /** 字符串最小长度（仅 type 为 string 系列时生效） */
  minLength?: number

  /** 字符串最大长度（仅 type 为 string 系列时生效） */
  maxLength?: number

  /** 数值最小值（仅 type 为 number 系列时生效） */
  min?: number

  /** 数值最大值（仅 type 为 number 系列时生效） */
  max?: number

  /**
   * 正则校验模式（字符串形式，运行时编译为 RegExp）。
   *
   * @example `"^[\\w.-]+@[\\w.-]+\\.\\w+$"`
   */
  pattern?: string

  /** 正则校验失败时的自定义提示消息。未设置时使用默认提示 */
  patternMessage?: string

  // ===== 计算字段属性 =====

  /**
   * 计算列表达式（JS 表达式字符串）。
   *
   * 行字段直接引用（无需前缀），外部上下文通过 `ctx` 对象引用，
   * 子表聚合通过 `$sum` / `$count` / `$avg` / `$min` / `$max` / `$list` / `$join` 函数。
   * 当前源码按 TableRelation 的 `childTable` 匹配子表 default 视图。
   * 计算列先于 `view.aggregates` 求值，因此视图级聚合可以聚合计算列。
   *
   * @example
   * `"price * qty"`
   * `"firstName + ' ' + lastName"`
   * `"ctx.taxRate ? amount * ctx.taxRate : amount"`
   * `"$sum('OrderItems', 'amount')"`
   * `"$count('OrderItems')"`
   * `"$join('Tags', 'name', ' | ')"`
   */
  computeExpression?: string
}

/**
 * 表资源类型。
 *
 * 用来描述 DataTable 背后的资源来源或承载形态，回答“这张表的数据以什么资源存在、从哪里来”。
 * 它是语义标签，不直接驱动 CRUD/级联行为。
 * 真正的运行时行为仍由 `api`、`tableRelations`、`viewDependencies` 等字段决定。
 *
 * 推荐值：
 * - `database-table`   — 直接映射数据库表
 * - `database-view`    — 直接映射数据库视图
 * - `third-party-api`  — 数据由外部第三方 API 提供
 * - `static-data`      — 数据以内联/本地静态资源形式存在，是当前约定下唯一允许直接声明 rows 的资源类型
 * - `dictionary`       — 明确对应字典/枚举/选项型资源
 * - `logical-view`     — 应用层拼装出的逻辑视图/投影视图
 *
 * 保留 `(string & {})` 扩展口，允许业务侧继续定义更细的资源类型。
 */
export const TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES = [
  'database-table',
  'database-view',
  'third-party-api',
  'static-data',
  'dictionary',
  'logical-view',
] as const

export type TableResourceType =
  | (typeof TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES)[number]
  | (string & {})

/**
 * 表业务分类。
 *
 * 用来描述 DataTable 在当前业务模型或页面中的角色，回答“这张表在业务里扮演什么角色”。
 * 它同样是语义标签，不代替 `tableRelations` / `viewDependencies` 这类运行时结构定义。
 *
 * 推荐值：
 * - `master`    — 主表
 * - `child`     — 从表 / 明细表
 * - `reference` — 引用表 / 参考表 / 查找表
 */
export const TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES = [
  'master',
  'child',
  'reference',
] as const

export type TableBusinessCategory =
  | (typeof TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES)[number]
  | (string & {})

/**
 * 表级语义元数据。
 *
 * 这组字段不表达运行时行为，而是补充表的“资源身份”和“业务角色”。
 * 适合给 AI 规划、管理后台、建模工具、导出元数据时消费。
 */
export interface TableSemanticMetadata {
  /** 资源类型：标记该表背后对应的资源来源或承载形态，并决定该表是否允许直接声明静态 rows。 */
  resourceType?: TableResourceType
  /** 资源 ID：对应外部系统中的稳定标识，如库表名、字典编码、第三方资源编码或静态资源标识。 */
  resourceId?: string
  /** 业务分类：标记当前表在业务模型中的角色，如主表/从表/引用表。 */
  businessCategory?: TableBusinessCategory
}

/**
 * CRUD 操作到端点的映射定义。
 *
 * 语义：描述“每个操作对应哪个接口”。
 * 这里只定义各 CRUD / Tree 操作对应的 URL、HTTP 方法和端点级参数，不包含重试、校验、转换等运行策略。
 */
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

/** 单条记录拉取选项。 */
export interface RetrieveRecordOptions {
  /** 是否将拉取结果同步回本地 rows。默认 true。 */
  syncToRows?: boolean
  /** 是否将拉取结果设为当前行。默认 false。 */
  setCurrentRow?: boolean
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
  /**
   * 视图行数据。
   *
   * 当前建模约定：仅当表的 resourceType = 'static-data' 时，才应在配置中直接声明 rows；
   * 其他资源类型应把数据视为远端来源，通过 requestData/loadFromServer 等机制获取。
   */
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
   * 增删改提交模式（默认 `'immediate'`）。
   *
   * - `'immediate'`（默认）：`addRow` / `editRowById` / `removeRow` 立即调用对应网络 CRUD（如已配置 API）
   * - `'staged'`：仅修改内存并标记脏状态，调用 `saveChanges()` 批量提交
   */
  commitMode?: CommitMode
  /**
   * 视图级聚合配置——输出名 → 聚合列配置。
   *
   * `aggregates` 是配置态输出，会被 `DataView.toJson()` 持久化；每个 key 是
   * `aggregateResult / selectionAggregateResult` 上的结果字段名。`config.field` 只决定从哪一列取源值，
   * 因而 key 与 field 可以不同。
   *
   * 聚合配置与列定义（`DataColumn.computeExpression`）完全独立：
   * 列负责逐行求值，聚合负责对已求值的行集合做整列汇总。
   *
   * @example
   * ```json
   * {
   *   "aggregates": {
   *     "totalPrice": { "type": "sum", "field": "price" },
   *     "avgScore":   { "type": "avg", "field": "score" }
   *   }
   * }
   * ```
   */
  aggregates?: Record<string, AggregateColumnConfig>
}

/**
 * 数据表元数据（对应 DataTable 核）
 *
 * 表级关注点：表名、列定义、CRUD API、CRUD 配置和视图集合。
 * 以实体序列化结果 `DataTable.toJson()` 为准：
 * - 所有默认视图字段均必须进入 `views.default`
 * - 表级不再承载 `rows / autoCurrentFirst / autoSelectFirst / page / pageSize` 等视图字段
 */
export interface ITableMetadata extends TableSemanticMetadata {
  tableName: string
  columns: DataColumn[]
  /**
   * CRUD API 配置。支持三种形式：
   * - 完整对象 `CrudApi`
   * - 字符串简写（RESTful 基础路径）：`"/api/users"` → 自动展开为完整 CRUD 端点
   * - `true`：从 tableName 按约定生成路径（`/api/${kebab-case(tableName)}`）
   */
  api?: CrudApi | string | boolean | undefined
  /** 表级 CRUD 配置（超时、重试、权限等） */
  crudConfig?: CrudOperationConfig | undefined
  /** 视图集合；canonical 结构中必须包含 `default` 视图 */
  views: { default: IViewMetadata } & Record<string, IViewMetadata>
}

/**
 * 数据集元数据（对应 DataSet.toJson() 输出）
 *
 * 顶层只承载数据集自身字段；表的默认视图数据必须继续下沉到 `tables.*.views.default`。
 */
export interface IDataSetMetadata {
  /**
   * Schema 格式版本（用于未来迁移兼容）。
   * 当前 canonical 结构为 2：`tables -> views -> default`。
   */
  schemaVersion?: number
  dataSetName: string
  tables: Record<string, ITableMetadata>

  /** L1: 表关系 — 声明表间外键/逻辑关联 */
  tableRelations?: TableRelation[]
  /** L2: 视图联动 — 声明视图联动策略（省略时自动从 tableRelations 推导） */
  viewDependencies?: ViewDependency[]
  /** 业务数据版本号（乐观锁），与 schemaVersion 含义不同 */
  version?: number
  pageId?: string
  /** 可选的设计器布局信息（如画布坐标）。 */
  layout?: IDataSetLayoutMetadata
}

/**
 * DataSet 级布局元数据。
 *
 * 该结构不参与运行时数据计算，仅用于设计器/编辑器恢复画布布局。
 */
export interface IDataSetLayoutMetadata {
  /** 表名 -> 画布位置。 */
  tablePositions?: Record<string, { x: number; y: number }>
}

// ===== 过滤和排序类型 =====

/**
 * 子视图响应父视图的数据变化触发源。
 *
 * 配置在 `ViewDependency.dependencyType`，决定父视图"哪种数据变化"会触发子视图重新级联加载。
 *
 * - `'currentRow'`   — 父视图当前聚焦行变化时触发（默认值）；子视图用当前行主键过滤
 * - `'selectedRows'` — 父视图选中行集合变化时触发；子视图用所有选中行的主键 in-list 过滤
 * - `'allRows'`      — 父视图全量行集合变化时触发（不区分分页）
 * - `'pagedRows'`    — 父视图当前分页行集合变化时触发
 */
export type DependencyType =
  | 'currentRow'
  | 'selectedRows'
  | 'allRows'
  | 'pagedRows'
  | (string & {})

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

/**
 * 过滤操作符。
 *
 * - `==` / `!=` / `>` / `>=` / `<` / `<=` — 标量比较，value 为单个标量
 * - `in` / `not in` — 集合成员，value 为数组
 * - `like` / `not like` — SQL LIKE 模式（`%` 通配），通常由后端执行
 * - `is null` / `is not null` — 空值判断，value 不使用
 * - `between` / `not between` — 区间，value 为 `[min, max]` 两元素数组
 * - `startsWith` / `endsWith` / `contains` — 字符串前缀/后缀/包含，前端内存过滤可用
 */
export type FilterOperator =
  | '==' | '!=' | '>' | '>=' | '<' | '<='
  | 'in' | 'not in' | 'like' | 'not like'
  | 'is null' | 'is not null'
  | 'between' | 'not between'
  | 'startsWith' | 'endsWith' | 'contains'

/**
 * 过滤值中对当前行字段的动态引用。
 *
 * 将过滤值绑定到父视图当前行的某个字段，而非写死静态值。
 * 例如 `{ kind: 'field', field: 'deptId' }` 表示"用当前行的 deptId 字段值做过滤"。
 */
export interface FilterFieldRef {
  kind: 'field'
  field: string
}

/**
 * 过滤条件的值侧类型。
 *
 * - 标量（`string | number | boolean | null`）：静态常量值
 * - `FilterFieldRef`：动态引用父视图当前行的字段值
 * - `FilterValueExpression[]`：`in / between` 等多值操作符使用的数组
 */
export type FilterValueExpression =
  | string
  | number
  | boolean
  | null
  | FilterFieldRef
  | FilterValueExpression[]

/**
 * 过滤表达式——树形判别联合。
 *
 * 四种形状：
 * - `{ field, op, value }` — 叶子条件（字段、操作符、值）
 * - `{ type: 'and' | 'or', children }` — 逻辑组合（AND/OR，可嵌套）
 * - `{ type: '!condition', field, op, value }` — 叶子条件取反（NOT）
 * - `{ type: '!and' | '!or', children }` — 逻辑组合取反（NAND/NOR）
 *
 * 叶子节点无 `type` 字段，通过是否存在 `field` 属性识别；组合节点通过 `type` 判别。
 */
export type FilterExpression =
  | { field: string; op: FilterOperator; value: FilterValueExpression }
  | { type: 'and' | 'or'; children: FilterExpression[] }
  | { type: '!condition'; field: string; op: FilterOperator; value: FilterValueExpression }
  | { type: '!and' | '!or'; children: FilterExpression[] }

// ===== 关系类型 =====

// ═══════════════════════════════════════════
// L1: 表关系（Data Schema）
// ═══════════════════════════════════════════

/**
 * 表关系 — 声明两张表之间的外键/逻辑关联。
 *
 * 纯数据结构描述，不涉及 UI 联动。
 * 消费者：计算列聚合函数（$sum/$count）、内存级联过滤、API 请求参数构建。
 *
 * SQL 等价：
 * ```sql
 * SELECT child.* FROM {childTable} child
 * JOIN {parentTable} parent ON child.{childField} = parent.{parentField}
 * ```
 *
 * @example
 * ```json
 * { "parentTable": "Users", "childTable": "Orders", "childField": "userId" }
 * ```
 */
export interface TableRelation {
  /** 关系名称（可选，用于日志和调试） */
  relationName?: string
  /** 父表名 */
  parentTable: string
  /** 子表名 */
  childTable: string

  // ── 简写模式（单字段外键，95% 场景）──
  /** 子表外键字段（简写模式必填） */
  childField?: string
  /** 父表匹配字段（默认取父表 primaryKey，通常 'id'） */
  parentField?: string

  // ── 完整条件（与 childField/parentField 互斥，后续迭代定义具体结构）──
  /**
   * 复合匹配条件（预留）。
   *
   * 用于复合键、带静态过滤等高级场景。
   * SQL 等价：JOIN ON + WHERE 合并。
   * 当前版本不消费此字段，具体结构后续迭代定义。
   */
  condition?: Record<string, unknown>

  // ── 声明性元数据 ──
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
}

// ═══════════════════════════════════════════
// L2: 视图联动（View Schema）
// ═══════════════════════════════════════════

/**
 * 视图依赖 — 声明子视图如何响应父视图数据变化。
 *
 * 基于 TableRelation 的字段信息工作，独立描述视图层面的联动策略。
 * 省略 `viewDependencies` 时框架为每条 TableRelation 自动生成默认依赖。
 *
 * @example
 * ```json
 * {
 *   "parentTable": "Users", "childTable": "Orders",
 *   "dependencyType": "selectedRows"
 * }
 * ```
 */
export interface ViewDependency {
  /** 与 TableRelation 对齐的父表名 */
  parentTable: string
  /** 与 TableRelation 对齐的子表名 */
  childTable: string
  /** 响应父视图的哪种数据变化（默认 'currentRow'） */
  dependencyType?: DependencyType
  /** 父变化时是否自动级联加载子视图（默认 true） */
  autoLoad?: boolean
}

// ═══════════════════════════════════════════
// 内部展开格式（TableRelation + ViewDependency 合并后）
// ═══════════════════════════════════════════

/**
 * 展开后的内部关系格式 — TableRelation + ViewDependency 合并后的字段绑定结果。
 *
 * @internal 仅供 spark-data 内部消费（CascadeDelegate / DataView / ComputedColumnDelegate）。
 * 外部配置使用 `TableRelation` + `ViewDependency`。
 */
export interface DataRelation {
  parentTable: string
  parentViewId?: string
  childTable: string
  childViewId?: string
  /** 父表中用于匹配的字段（默认取父视图 primaryKey，通常为 'id'） */
  parentField?: string
  /** 子表中用于匹配的字段（简写模式必填） */
  childField?: string
  /** 依赖类型（默认 'currentRow'） */
  dependencyType?: DependencyType
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
  /** 父变化时是否自动级联加载子视图（默认 true——仅 `false` 时跳过） */
  autoLoad?: boolean
  relationName?: string
}

// ===== 树类型 =====

/**
 * 树操作端点配置——flat/nested 双模式成套接口族。
 *
 * 每个端点均继承 `HttpEndpoint`，`url` 中可使用 `{id}`、`{parentId}` 等路径占位符。
 * flat 模式（node/children/path/subtree/move/search）与 nested 模式（nested/nestedSearch）可按需配置，互不依赖。
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
   * /tree/move — 移动节点到新父节点下
   * params/body: id, newParentId?, index?
   */
  move?: HttpEndpoint
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

/**
 * 树结构字段配置（属于视图层，固化在 DataView）。
 *
 * 树操作 HTTP 接口族配置在 `CrudApi`；模型层始终存储平铺数据，树形态由视图层组织。
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
 * 增删改提交模式。
 *
 * - `'immediate'`（默认）：`addRow` / `editRowById` / `removeRow` 立即调用对应网络 CRUD（如已配置 API）
 * - `'staged'`：仅修改内存并标记脏状态，需调用 `saveChanges()` 批量提交
 */
export type CommitMode = 'immediate' | 'staged'

/**
 * DataView 请求状态机。
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
  /** L1: 表关系定义 */
  readonly tableRelations: TableRelation[] | undefined
  /** L2: 视图联动定义 */
  readonly viewDependencies: ViewDependency[] | undefined
  /** Schema 格式版本（默认 1） */
  readonly schemaVersion: number
  /** 业务数据版本号（乐观锁） */
  readonly version: number | undefined
  /** 页面ID */
  readonly pageId: string | undefined

  /** 查询以指定视图为父的子关系（视图级索引） */
  getChildRelations(parentTable: string, parentViewId: string): DataRelation[]
  /** 查询以指定视图为子的父关系（视图级索引） */
  getParentRelations(childTable: string, childViewId: string): DataRelation[]
  /** 查询以指定表为父的所有表关系（表级索引，聚合函数消费） */
  getTableChildRelations(parentTable: string): TableRelation[]
  /** 查询以指定表为子的所有表关系（表级索引） */
  getTableParentRelations(childTable: string): TableRelation[]
  /** 动态添加数据表 */
  addTable(tableName: string, columns: DataColumn[]): DataTable
  /** 删除未被关系或依赖引用的数据表 */
  removeTable(tableName: string): void
  /** 添加表关系 */
  addRelation(params: {
    parentTable: string
    childTable: string
    parentField: string
    childField: string
    relationName?: string
  }): void
  /** 更新表关系 */
  updateRelation(
    selector: {
      parentTable: string
      childTable: string
      parentField?: string
      childField?: string
    },
    updates: Partial<TableRelation>,
  ): TableRelation
  /** 删除表关系 */
  removeRelation(selector: {
    parentTable: string
    childTable: string
    parentField?: string
    childField?: string
  }): void
  /** 添加视图依赖 */
  addDependency(params: {
    parentTable: string
    childTable: string
    dependencyType?: DependencyType | undefined
    autoLoad?: boolean
  }): void
  /** 更新视图依赖 */
  updateDependency(
    parentTable: string,
    childTable: string,
    updates: Partial<ViewDependency>,
  ): ViewDependency
  /** 删除视图依赖 */
  removeDependency(parentTable: string, childTable: string): void
  /** 获取数据表 */
  getTable(name: string): DataTable | undefined
  /** 获取数据视图（委托到 DataTable） */
  getView(tableName: string, viewId?: string): SparkDataView | undefined
  /** 注入 APP_SERVICES（用于 URL 模板 tenant/project 作用域解析） */
  setAppServices(appServices: DataSetAppServices): void
  /** 注入页面路由快照（APP_SERVICES 缺失时用于 URL 模板 tenant/project 作用域解析） */
  setPageRoute(route: unknown): void
  /** 生成端点 URL 模板上下文参数 */
  getRequestTemplateParams(): Record<string, unknown>
  /** 序列化为 JSON 友好的元数据对象 */
  toJson(): IDataSetMetadata
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
 * CRUD 通用运行策略配置。
 *
 * 语义：描述“调用端点时应用什么策略”。
 * 这里定义超时、重试、权限校验、数据校验，以及请求/响应转换等运行期策略，不负责声明端点映射。
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
