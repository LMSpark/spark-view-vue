/**
 * DataSetCrudTool → Future Stills Catalog
 *
 * 目标：
 * 1. 把 DataSetCrudTool 的公开能力整理成 stills.capabilities 可消费的能力表；
 * 2. 把每个动作的参数规格、结果结构、使用规则整理成 stills.actionSpec 可消费的参数表；
 * 3. 作为 edit-dataset-stills 的统一事实源，直接驱动运行时 still 定义。
 *
 * 约束：
 * - 本文件只提供 catalog 与参数校验，不直接承担 execute 分发；
 * - DataSetCrudTool 调用统一采用对象参数签名，LLM 按 paramsSchema 直接调用 crudToolMethod；
 * - action 统一使用 datasetTool.* 命名空间，避免与 datatable.* / dataview.* stills 冲突；
 * - constructor / dataSet / dataSetName / toJson 不单独暴露给 LLM：
 *   - constructor 由宿主注入；
 *   - dataSet / dataSetName 属于运行时上下文；
 *   - toJson 语义与 datasetTool.export 重合，统一折叠到 datasetTool.export。
 */
import { formatLlmParamValidationIssues, validateLlmDeserializedParams } from '../../../core/stills/llm-params-validator'
import {
  DATASET_EXPORT_ACTION,
  DATATABLE_DESCRIBE_ACTION,
  DATATABLE_ADD_COLUMNS_ACTION,
  DATATABLE_UPDATE_COLUMN_ACTION,
  DATATABLE_REMOVE_COLUMN_ACTION,
  DATATABLE_CREATE_ACTION,
  DATAVIEW_DESCRIBE_ACTION,
  DATAVIEW_CREATE_ACTION,
  DATAVIEW_CONFIGURE_ACTION,
  RELATION_LIST_ACTION,
  RELATION_ADD_ACTION,
  RELATION_REMOVE_ACTION,
  DEPENDENCY_ADD_ACTION,
  DEPENDENCY_REMOVE_ACTION,
} from '../../../core/stills/action-names'

/** 单个动作的结构化失败模式，用于给 LLM 提前暴露 fail-fast 边界。 */
export interface DatasetCrudToolStillFailureMode {
  /** 稳定失败码，便于未来 adapter / 提示词按 code 分流。 */
  code: string
  /** 失败发生的典型场景。 */
  when: string
  /** 建议给调用方或 LLM 的修复动作。 */
  fix: string
}

/** 动作类型：要么是会改状态的 request，要么是只读的 describe。 */
export type DatasetCrudToolStillType = 'request' | 'describe'

/** 动作主要作用的对象层级，供目录页和 LLM 做分组理解。 */
export type DatasetCrudToolStillTarget =
  | 'dataset'
  | 'table'
  | 'column'
  | 'view'
  | 'row'
  | 'relation'
  | 'dependency'

/**
 * 参数表中的一行，也是本文件对单个 datasetTool.* 动作的事实源。
 *
 * 这里保存完整规格：参数、返回、示例、规则、失败模式。
 * 未来如果要接 stills.actionSpec 或真正的执行 adapter，应优先消费这张表。
 */
export interface DatasetCrudToolStillParameterRow {
  /** 未来暴露给 LLM 的动作名。 */
  action: string
  /** 动作类型：request / describe。 */
  type: DatasetCrudToolStillType
  /** 该动作主要作用在哪一层对象上。 */
  target: DatasetCrudToolStillTarget
  /** 对应的 DataSetCrudTool 公开方法名；其对象参数形状与 paramsSchema 对齐。 */
  crudToolMethod: string
  /** 面向人和 LLM 的简短语义说明。 */
  description: string
  /** 参数结构说明，面向 LLM 可读，而不是面向 TS 编译器。 */
  paramsSchema: Record<string, unknown>
  /** 返回结果结构说明。 */
  resultSchema: Record<string, unknown>
  /** 最小可用示例，优先服务后续 LLM 调用。 */
  example: Record<string, unknown>
  /** 该动作的参数校验规则（内联在 row 上，避免额外映射表漂移）。 */
  validation?: DatasetCrudToolStillValidationRule
  /** 使用约束 / 关键规则。 */
  usageRules: string[]
  /** 常见失败模式及修复建议。 */
  failureModes: DatasetCrudToolStillFailureMode[]
  /** 当前 stills 体系里大致对应的动作，用于迁移和对照。 */
  currentStillAction?: string
}

/**
 * 能力表中的一行。
 *
 * 它是 DatasetCrudToolStillParameterRow 的目录级投影，专门给 stills.capabilities
 * 这种“动作列表视图”消费，因此只保留摘要字段和 paramsRef。
 */
export interface DatasetCrudToolStillCapabilityRow {
  /** 动作名。 */
  action: string
  /** 动作类型：request / describe。 */
  type: DatasetCrudToolStillType
  /** 动作作用目标。 */
  target: DatasetCrudToolStillTarget
  /** 对应的 DataSetCrudTool 方法名；运行时可直接接收与 paramsSchema 对齐的对象参数。 */
  crudToolMethod: string
  /** 动作摘要说明。 */
  description: string
  /** 集成状态：catalog-only 表示仅目录，runtime-wired 表示已接入运行时 still 分发。 */
  integrationStatus: 'catalog-only' | 'runtime-wired'
  /** 指回参数表 action，避免能力表重复存完整规格。 */
  paramsRef: string
  currentStillAction?: string
  rules?: string[]
  failureCodes?: string[]
  params?: Record<string, unknown>
  example?: Record<string, unknown>
}

// 通用 schema 片段，避免无参动作重复写空对象字面量。
const NO_PARAMS: Record<string, unknown> = {}

// 通用参数描述片段。
const TABLE_NAME_PARAM = 'string — 表名'
const VIEW_ID_PARAM = 'string — 视图 ID；省略时默认 default'
const COLUMN_NAME_PARAM = 'string — 列名'
const ROW_ID_PARAM = 'string | number — 主键值'
const PARENT_TABLE_PARAM = 'string — 父表名'
const CHILD_TABLE_PARAM = 'string — 子表名'
const RESOURCE_ID_PARAM = 'string? — 资源 ID'

// 保持与 spark-data/src/types.ts 的推荐值一致，避免依赖 dist 类型出口漂移。
const TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES = [
  'database-table',
  'database-view',
  'third-party-api',
  'static-data',
  'dictionary',
  'logical-view',
] as const

const TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES = [
  'master',
  'child',
  'reference',
] as const

const RESOURCE_TYPE_SCHEMA = {
  kind: 'enum',
  type: 'string',
  enum: TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  optional: true,
  openEnded: true,
  note: '资源类型推荐值字典；优先使用内置资源类型，也允许业务侧自定义字符串。',
} as const

const NULLABLE_RESOURCE_TYPE_SCHEMA = {
  ...RESOURCE_TYPE_SCHEMA,
  nullable: true,
  note: '资源类型推荐值字典；传 null 表示显式清空，也允许业务侧自定义字符串。',
} as const

const BUSINESS_CATEGORY_SCHEMA = {
  kind: 'enum',
  type: 'string',
  enum: TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
  optional: true,
  openEnded: true,
  note: '业务分类推荐值字典；优先使用 master / child / reference，也允许业务侧自定义字符串。',
} as const

const NULLABLE_BUSINESS_CATEGORY_SCHEMA = {
  ...BUSINESS_CATEGORY_SCHEMA,
  nullable: true,
  note: '业务分类推荐值字典；传 null 表示显式清空，也允许业务侧自定义字符串。',
} as const

const DATA_COLUMN_FIELDS_SCHEMA = {
  name: 'string — 列名，必填，表内唯一',
  type: 'ColumnType — 列类型，必填；常用 string/number/boolean/date/datetime',
  label: 'string? — UI 显示标题',
  isPrimaryKey: 'boolean? — 是否主键',
  allowDBNull: 'boolean? — 是否允许 null',
  defaultValue: 'unknown? — 默认值',
  autoIncrement: 'boolean? — 是否自增',
  required: 'boolean? — UI 必填标记',
  minLength: 'number? — 字符串最小长度',
  maxLength: 'number? — 字符串最大长度',
  min: 'number? — 数值最小值',
  max: 'number? — 数值最大值',
  pattern: 'string? — 正则表达式字符串',
  patternMessage: 'string? — 正则失败提示',
  computeExpression: 'string? — 计算列表达式',
} as const

const DATA_COLUMN_SCHEMA = {
  kind: 'object',
  required: ['name', 'type'],
  properties: DATA_COLUMN_FIELDS_SCHEMA,
  note: '必须传 JSON 对象，不要把 column 写成 "DataColumn" 之类的类型名字符串。',
} as const

const PARTIAL_DATA_COLUMN_SCHEMA = {
  kind: 'object',
  optional: DATA_COLUMN_FIELDS_SCHEMA,
  note: '只传要修改的字段；通常不要在 updates 中修改 name。',
} as const

const DATA_COLUMN_ARRAY_SCHEMA = {
  kind: 'array',
  items: DATA_COLUMN_SCHEMA,
} as const

const COLUMN_UPDATE_ENTRY_SCHEMA = {
  kind: 'object',
  required: ['columnName', 'updates'],
  properties: {
    columnName: COLUMN_NAME_PARAM,
    updates: PARTIAL_DATA_COLUMN_SCHEMA,
  },
} as const

const ROW_DATA_SCHEMA = {
  kind: 'object',
  additionalProperties: 'unknown — 键名必须来自已声明列名，值类型要匹配列定义',
  note: '不要传未声明字段；主键字段必须能被当前表 schema 接受。',
} as const

const ROW_ARRAY_SCHEMA = {
  kind: 'array',
  items: ROW_DATA_SCHEMA,
} as const

const TREE_CONFIG_SCHEMA = {
  kind: 'object',
  optional: {
    idField: 'string? — 节点 id 字段名',
    parentIdField: 'string? — 父节点 id 字段名',
    textField: 'string? — 节点文本字段名',
    depthLimit: 'number? — 最大展开深度',
    lazy: 'boolean? — 是否懒加载',
    treeMode: '"flat" | "nested" ? — 树数据模式',
  },
} as const

const AGGREGATE_ITEM_SCHEMA = {
  kind: 'object',
  required: ['type'],
  properties: {
    type: '"sum" | "count" | "avg" | "min" | "max" | "join" — 不只有求和；按场景选择计数/平均/极值/字符串拼接',
    field: 'string? — 源字段名；省略时默认与聚合输出键同名',
    label: 'string? — UI 展示标题',
    separator: 'string? — join 聚合分隔符，仅 type="join" 时有效',
  },
} as const

const AGGREGATES_SCHEMA = {
  kind: 'object',
  additionalProperties: AGGREGATE_ITEM_SCHEMA,
  note: '这是 Record<string, AggregateColumnConfig> / Map-like 对象结构，不是数组。对象键就是聚合输出字段名，例如 totalAmount、rowCount、avgScore、minPrice、maxPrice、statusList；配置本身会进入 view.toJson()/fromJson()，而 summaryRow / selectionSummaryRow 是运行时派生结果。',
} as const

const VIEW_METADATA_SCHEMA = {
  kind: 'object',
  optional: {
    rows: 'IDataRow[]? — 仅 resourceType = static-data 时才应直接提供',
    autoCurrentFirst: 'boolean? — 请求成功后是否自动聚焦第一行',
    autoSelectFirst: 'boolean? — 请求成功后是否自动选中第一行',
    page: 'number? — 当前页',
    pageSize: 'number? — 每页大小',
    autoLoad: 'boolean? — DataSet 初始化后是否自动加载',
    autoRefresh: 'boolean? — page/filter/sort 变化后是否自动刷新',
    commitMode: '"immediate" | "staged" ? — 提交模式',
    valueField: 'string | string[] ? — 值序列化字段',
    labelField: 'string? — 标签字段',
    selectionDelimiter: 'string? — 多选序列化分隔符；空字符串表示单选',
    treeConfig: TREE_CONFIG_SCHEMA,
    filterExpression: 'FilterExpression? — 复杂过滤对象；简单场景建议先省略',
    sortExpression: 'SortField[]? — 例如 [{ field: "createdAt", direction: "desc" }]',
    aggregates: AGGREGATES_SCHEMA,
  },
  note: '只传需要的键；如果包含 rows，会先 replaceRows 再应用其他视图配置。若配置 aggregates，汇总结果可通过 Table@summaryRow / Table@selectionSummaryRow（或 Table@viewId@summaryRow）这类 DataKey 被 UI 引用。',
} as const

const CRUD_HTTP_ENDPOINT_SCHEMA = {
  kind: 'object',
  required: ['url'],
  properties: {
    url: 'string — 接口地址',
    method: '"GET" | "POST" | "PUT" | "PATCH" | "DELETE" ? — 默认由后端或调用方约定',
    headers: 'Record<string, string> ? — 请求头',
    params: 'Record<string, unknown> ? — 查询参数模板',
    pathParams: 'string[] ? — 路径占位参数名，例如 ["id"]',
    baseURL: 'string? — 可选 API 基础地址',
  },
} as const

const CRUD_LIST_ENDPOINT_SCHEMA = {
  ...CRUD_HTTP_ENDPOINT_SCHEMA,
  properties: {
    ...CRUD_HTTP_ENDPOINT_SCHEMA.properties,
    pagination: {
      kind: 'object',
      optional: {
        pageParam: 'string? — 页码参数名',
        sizeParam: 'string? — 分页大小参数名',
        sortParam: 'string? — 排序参数名',
      },
    },
  },
} as const

const CRUD_API_SCHEMA = {
  kind: 'object',
  optional: {
    list: CRUD_LIST_ENDPOINT_SCHEMA,
    create: CRUD_HTTP_ENDPOINT_SCHEMA,
    retrieve: CRUD_HTTP_ENDPOINT_SCHEMA,
    update: CRUD_HTTP_ENDPOINT_SCHEMA,
    delete: CRUD_HTTP_ENDPOINT_SCHEMA,
    import: CRUD_HTTP_ENDPOINT_SCHEMA,
    export: CRUD_HTTP_ENDPOINT_SCHEMA,
    batch: {
      kind: 'object',
      optional: {
        create: CRUD_HTTP_ENDPOINT_SCHEMA,
        update: CRUD_HTTP_ENDPOINT_SCHEMA,
        delete: CRUD_HTTP_ENDPOINT_SCHEMA,
      },
    },
    node: CRUD_HTTP_ENDPOINT_SCHEMA,
    children: {
      ...CRUD_HTTP_ENDPOINT_SCHEMA,
      properties: {
        ...CRUD_HTTP_ENDPOINT_SCHEMA.properties,
        limit: 'number? — 最大返回子节点数',
      },
    },
    path: CRUD_HTTP_ENDPOINT_SCHEMA,
    subtree: CRUD_HTTP_ENDPOINT_SCHEMA,
    nestedSearch: CRUD_HTTP_ENDPOINT_SCHEMA,
  },
  note: '至少提供一个端点；不要把 api 误写成单个 { url, method }，而要按 list/create/update/delete 等键组织。',
} as const

const CRUD_OPERATION_CONFIG_SCHEMA = {
  kind: 'object',
  optional: {
    timeout: 'number? — 超时毫秒数',
    retryCount: 'number? — 重试次数',
    skipPermissionCheck: 'boolean? — 是否跳过权限检查',
    validateData: 'boolean? — 是否在请求前校验数据',
    modelPermission: 'IModelPermission? — 模型级权限快照对象',
    instancePermission: 'IInstancePermission? — 实例级权限快照对象',
    transformRequest: '不要传函数；LLM 场景应省略此字段',
    transformResponse: '不要传函数；LLM 场景应省略此字段',
  },
  note: '函数类型字段无法稳定通过协议块传输；LLM 调用时请省略 transformRequest / transformResponse。',
} as const

const VIEWS_SCHEMA = {
  kind: 'object',
  optional: {
    default: VIEW_METADATA_SCHEMA,
    '<customViewId>': VIEW_METADATA_SCHEMA,
  },
  note: '对象键就是 viewId；default 可配置但不会新建，非 default 键会创建对应视图。',
} as const

const RELATION_SELECTOR_SCHEMA = {
  kind: 'object',
  required: ['parentTable', 'childTable'],
  properties: {
    parentTable: PARENT_TABLE_PARAM,
    childTable: CHILD_TABLE_PARAM,
    parentField: 'string? — 同一父子表有多条关系时建议显式提供',
    childField: 'string? — 同一父子表有多条关系时建议显式提供',
  },
  note: '优先传完整 selector，避免关系歧义。',
} as const

const RELATION_UPDATE_SCHEMA = {
  kind: 'object',
  optional: {
    relationName: 'string? — 关系名',
    parentTable: 'string? — 新父表名',
    childTable: 'string? — 新子表名',
    parentField: 'string? — 新父表字段',
    childField: 'string? — 新子表字段',
    condition: 'Record<string, unknown> ? — 高级条件，简单场景建议省略',
    cascadeUpdate: 'boolean? — 是否级联更新',
    cascadeDelete: 'boolean? — 是否级联删除',
  },
} as const

const DEPENDENCY_TYPE_RECOMMENDED_VALUES = [
  'currentRow',
  'selectedRows',
  'allRows',
  'pagedRows',
] as const

const DEPENDENCY_TYPE_PARAM = {
  kind: 'enum',
  type: 'string',
  enum: DEPENDENCY_TYPE_RECOMMENDED_VALUES,
  optional: true,
  openEnded: true,
  note: '依赖类型推荐值字典；常用 currentRow / selectedRows / allRows / pagedRows，也允许业务侧自定义字符串。',
} as const

const VIEW_DEPENDENCY_UPDATE_SCHEMA = {
  kind: 'object',
  optional: {
    parentTable: PARENT_TABLE_PARAM,
    childTable: CHILD_TABLE_PARAM,
    dependencyType: DEPENDENCY_TYPE_PARAM,
    autoLoad: 'boolean? — 父变化时是否自动加载子视图',
  },
} as const

// 通用规则描述片段。
const STATIC_ROWS_ONLY_RULE = '只有 resourceType = static-data 时，才应直接通过 rows 或 defaultRows 传静态数据。'
const DEFAULT_VIEW_RULE = '省略 viewId 时默认作用于 default 视图。'
const DEFAULT_VIEW_LIFECYCLE_RULE = 'default 视图不能通过 createView 创建，也不能通过 deleteView 删除。'
const REMOTE_ROW_RESULT_RULE = '行级 request 动作在远端 CRUD 模式下可能返回 CrudResult，本地模式返回本地对象或布尔值。'
const RELATION_AMBIGUITY_RULE = '同一 parentTable + childTable 下存在多条关系时，必须补 parentField 与 childField 做消歧。'
const CATALOG_ONLY_RULE = '该动作已由 edit-dataset-stills 直接消费；目录定义与运行时行为需保持一致。'
const JSON_OBJECT_RULE = '对 column/updates/views/api/crudConfig/config/selector 等复杂参数，必须传 JSON 对象，不要传 TypeScript 类型名字符串。'

type DatasetCrudToolStillValidationRule = {
  requiredKeys?: readonly string[]
  oneOfRequiredKeyGroups?: ReadonlyArray<readonly string[]>
}

/** 为 describe 型动作补齐固定 type，减少表项样板。 */
function defineDescribeRow(
  row: Omit<DatasetCrudToolStillParameterRow, 'type'>,
): DatasetCrudToolStillParameterRow {
  return {
    type: 'describe',
    ...row,
  }
}

/** 为 request 型动作补齐固定 type，减少表项样板。 */
function defineRequestRow(
  row: Omit<DatasetCrudToolStillParameterRow, 'type'>,
): DatasetCrudToolStillParameterRow {
  return {
    type: 'request',
    ...row,
  }
}

/**
 * 把“完整参数表”压缩成“能力目录表”。
 *
 * 能力表只保留目录页真正需要的摘要字段；详细规格仍以参数表为准。
 */
function toCapabilityRow(row: DatasetCrudToolStillParameterRow): DatasetCrudToolStillCapabilityRow {
  return {
    action: row.action,
    type: row.type,
    target: row.target,
    crudToolMethod: row.crudToolMethod,
    description: row.description,
    integrationStatus: 'runtime-wired',
    paramsRef: row.action,
    ...(row.currentStillAction ? { currentStillAction: row.currentStillAction } : {}),
    ...(row.usageRules.length > 0 ? { rules: row.usageRules } : {}),
    ...(row.failureModes.length > 0 ? { failureCodes: row.failureModes.map(item => item.code) } : {}),
    ...(Object.keys(row.paramsSchema).length > 0 ? { params: row.paramsSchema } : {}),
    ...(Object.keys(row.example).length > 0 ? { example: row.example } : {}),
  }
}

/**
 * 参数表：stills.actionSpec / LLM adapter 的单动作规格数据源。
 *
 * 这里是完整事实源；能力表由它投影生成。
 */
export const DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE = [
  defineDescribeRow({
    action: 'datasetTool.export',
    target: 'dataset',
    crudToolMethod: 'toJson',
    description: '导出当前 DataSet 元数据快照',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      dataSet: 'IDataSetMetadata（不含 layout）— 面向 AI 的数据集元数据快照',
    },
    example: {},
    usageRules: [
      '返回值应作为只读快照消费，不应直接修改后假定自动回写运行时。',
      'AI 侧不处理布局字段；layout 由设计器内部维护。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
    currentStillAction: DATASET_EXPORT_ACTION,
  }),
  defineDescribeRow({
    action: 'datasetTool.canUndo',
    target: 'dataset',
    crudToolMethod: 'canUndo',
    description: '读取当前历史栈是否可撤销',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      canUndo: 'boolean — true 表示可执行 datasetTool.undo',
    },
    example: {},
    usageRules: [
      '建议在调用 datasetTool.undo 前先检查该值，避免无效操作。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'datasetTool.canRedo',
    target: 'dataset',
    crudToolMethod: 'canRedo',
    description: '读取当前历史栈是否可重做',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      canRedo: 'boolean — true 表示可执行 datasetTool.redo',
    },
    example: {},
    usageRules: [
      '建议在调用 datasetTool.redo 前先检查该值，避免无效操作。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'datasetTool.historyCursor',
    target: 'dataset',
    crudToolMethod: 'historyCursor',
    description: '读取当前历史游标位置',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      cursor: 'number — 当前快照游标索引（从 0 开始）',
    },
    example: {},
    usageRules: [
      '该值用于调试与可观测性，不建议作为业务分支唯一依据。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
  }),
  defineRequestRow({
    action: 'datasetTool.undo',
    target: 'dataset',
    crudToolMethod: 'undo',
    description: '撤销最近一次写操作快照',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      dataSet: 'IDataSetMetadata — 撤销后的数据集快照',
    },
    example: {},
    usageRules: [
      '当 canUndo 为 false 时返回 false，不抛错；调用方应按返回值判断。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNDO_NOT_AVAILABLE',
        when: '没有可撤销历史快照',
        fix: '检查返回值；若为 false，先执行至少一次写操作，或跳过 undo。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.redo',
    target: 'dataset',
    crudToolMethod: 'redo',
    description: '重做最近一次被撤销的写操作快照',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      dataSet: 'IDataSetMetadata — 重做后的数据集快照',
    },
    example: {},
    usageRules: [
      '当 canRedo 为 false 时返回 false，不抛错；调用方应按返回值判断。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'REDO_NOT_AVAILABLE',
        when: '没有可重做历史快照',
        fix: '检查返回值；若为 false，先执行 undo 产生可重做快照，或跳过 redo。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.clearHistory',
    target: 'dataset',
    crudToolMethod: 'clearHistory',
    description: '清空历史栈并以当前状态重建基线快照',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      cleared: 'boolean — 历史重置完成后视为 true',
    },
    example: {},
    usageRules: [
      '清空后 undo/redo 都会回到不可用状态。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'datasetTool.listTables',
    target: 'dataset',
    crudToolMethod: 'listTables',
    description: '列出当前 DataSet 的全部数据表',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      tables: 'DataTable[] — 当前数据表列表',
    },
    example: {},
    usageRules: [
      '适合先做能力探测，再决定后续针对哪张表执行 create/update/delete。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'datasetTool.getTable',
    target: 'table',
    crudToolMethod: 'getTable',
    description: '获取指定数据表',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
    },
    resultSchema: {
      table: 'DataTable | undefined — 命中的数据表',
    },
    example: {
      tableName: 'Users',
    },
    validation: { requiredKeys: ['tableName'] },
    usageRules: [
      '不存在时返回 undefined，而不是抛错。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
    currentStillAction: DATATABLE_DESCRIBE_ACTION,
  }),
  defineDescribeRow({
    action: 'datasetTool.listColumns',
    target: 'column',
    crudToolMethod: 'listColumns',
    description: '列出指定表的全部列定义',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
    },
    resultSchema: {
      columns: 'DataColumn[] — 列定义数组副本',
    },
    example: {
      tableName: 'Users',
    },
    validation: { requiredKeys: ['tableName'] },
    usageRules: [
      '表不存在时抛错。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认表名，或先执行 datasetTool.listTables。',
      },
    ],
    currentStillAction: DATATABLE_DESCRIBE_ACTION,
  }),
  defineDescribeRow({
    action: 'datasetTool.getColumn',
    target: 'column',
    crudToolMethod: 'getColumn',
    description: '获取指定表中的单个列定义',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
    },
    resultSchema: {
      column: 'DataColumn | undefined — 命中的列定义',
    },
    example: {
      tableName: 'Users',
      columnName: 'name',
    },
    validation: { requiredKeys: ['tableName', 'columnName'] },
    usageRules: [
      '表不存在时抛错；列不存在时返回 undefined。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认表名，或先执行 datasetTool.listTables。',
      },
    ],
    currentStillAction: DATATABLE_DESCRIBE_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.createColumn',
    target: 'column',
    crudToolMethod: 'createColumn',
    description: '向指定表追加一列',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      column: DATA_COLUMN_SCHEMA,
    },
    resultSchema: {
      table: 'DataTable — 更新后的数据表实例',
    },
    example: {
      tableName: 'Users',
      column: { name: 'email', type: 'string' },
    },
    validation: { requiredKeys: ['tableName', 'column'] },
    usageRules: [
      JSON_OBJECT_RULE,
      '底层统一走 DataTable.addColumns，保证 validator 和 DataView 列缓存同步刷新。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认表名，或先创建该表。',
      },
      {
        code: 'INVALID_COLUMN',
        when: '列定义不合法或与已有列冲突',
        fix: '检查 column.name、column.type 与现有 schema。',
      },
    ],
    currentStillAction: DATATABLE_ADD_COLUMNS_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.updateColumn',
    target: 'column',
    crudToolMethod: 'updateColumn',
    description: '更新指定列定义',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
      updates: PARTIAL_DATA_COLUMN_SCHEMA,
    },
    resultSchema: {
      table: 'DataTable — 更新后的数据表实例',
    },
    example: {
      tableName: 'Users',
      columnName: 'name',
      updates: { label: 'User Name' },
    },
    validation: { requiredKeys: ['tableName', 'columnName', 'updates'] },
    usageRules: [
      JSON_OBJECT_RULE,
      '列更新会触发 DataTable 内部运行时刷新链。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 datasetTool.getColumn 或 datasetTool.listColumns。',
      },
    ],
    currentStillAction: DATATABLE_UPDATE_COLUMN_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.renameColumn',
    target: 'column',
    crudToolMethod: 'renameColumn',
    description: '重命名指定列，并同步更新该表视图、静态 rows 与相关关系引用',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
      newColumnName: 'string — 新列名，表内唯一',
    },
    resultSchema: {
      table: 'DataTable — 重命名后的数据表实例',
    },
    example: {
      tableName: 'Users',
      columnName: 'name',
      newColumnName: 'userName',
    },
    validation: { requiredKeys: ['tableName', 'columnName', 'newColumnName'] },
    usageRules: [
      '仅用于列身份变更；普通元数据修改仍优先用 datasetTool.updateColumn。',
      '会同步改写当前表 views 中的字段引用、静态 rows 字段键，以及 tableRelations 中的 parentField/childField 引用。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认 tableName，或先执行 datasetTool.listTables。',
      },
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 datasetTool.getColumn 或 datasetTool.listColumns。',
      },
      {
        code: 'COLUMN_ALREADY_EXISTS',
        when: 'newColumnName 在同一表中已存在',
        fix: '换一个未占用的新列名，或先清理冲突列。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.deleteColumn',
    target: 'column',
    crudToolMethod: 'deleteColumn',
    description: '删除指定列',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
    },
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      tableName: 'Users',
      columnName: 'email',
    },
    validation: { requiredKeys: ['tableName', 'columnName'] },
    usageRules: [
      '删除后会同步刷新 DataView 列缓存。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 datasetTool.getColumn 或 datasetTool.listColumns。',
      },
    ],
    currentStillAction: DATATABLE_REMOVE_COLUMN_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.createTable',
    target: 'table',
    crudToolMethod: 'createTable',
    description: '创建数据表，并按需初始化资源语义、API、CRUD 配置和视图',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columns: DATA_COLUMN_ARRAY_SCHEMA,
      resourceType: RESOURCE_TYPE_SCHEMA,
      resourceId: RESOURCE_ID_PARAM,
      businessCategory: BUSINESS_CATEGORY_SCHEMA,
      api: CRUD_API_SCHEMA,
      crudConfig: CRUD_OPERATION_CONFIG_SCHEMA,
      views: VIEWS_SCHEMA,
    },
    resultSchema: {
      table: 'DataTable — 新建的数据表实例',
    },
    example: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
      ],
      resourceType: 'database-table',
      resourceId: 'crm.users',
      businessCategory: 'master',
    },
    validation: { requiredKeys: ['tableName', 'columns'] },
    usageRules: [
      JSON_OBJECT_RULE,
      STATIC_ROWS_ONLY_RULE,
      'LLM 场景下 crudConfig 中的 transformRequest/transformResponse 应省略，不要尝试传函数。',
      'views.default 不会新建，只会复用建表时自动创建的 default 视图。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'TABLE_ALREADY_EXISTS',
        when: '同名表已存在',
        fix: '改用 datasetTool.updateTable 或换一个 tableName。',
      },
      {
        code: 'INVALID_TABLE_CONFIG',
        when: '列定义、视图配置或 API 配置不合法',
        fix: '先缩小到最小可用 schema，再逐步补齐配置。',
      },
    ],
    currentStillAction: DATATABLE_CREATE_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.updateTable',
    target: 'table',
    crudToolMethod: 'updateTable',
    description: '更新数据表结构、资源语义及运行配置',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columnsToAdd: DATA_COLUMN_ARRAY_SCHEMA,
      columnUpdates: {
        kind: 'array',
        items: COLUMN_UPDATE_ENTRY_SCHEMA,
      },
      columnsToRemove: 'string[]? — 需要删除的列名列表',
      api: CRUD_API_SCHEMA,
      crudConfig: {
        ...CRUD_OPERATION_CONFIG_SCHEMA,
        note: '传 null 表示显式移除已有 crudConfig；传对象表示新的运行配置。',
      },
      resourceType: NULLABLE_RESOURCE_TYPE_SCHEMA,
      resourceId: 'string | null? — null 表示显式清空',
      businessCategory: NULLABLE_BUSINESS_CATEGORY_SCHEMA,
      defaultRows: ROW_ARRAY_SCHEMA,
    },
    resultSchema: {
      table: 'DataTable — 更新后的数据表实例',
    },
    example: {
      tableName: 'StatusOptions',
      resourceType: 'logical-view',
      resourceId: null,
      businessCategory: 'reference',
    },
    validation: { requiredKeys: ['tableName'] },
    usageRules: [
      JSON_OBJECT_RULE,
      '结构变更优先于 api/crudConfig/defaultRows 更新执行。',
      STATIC_ROWS_ONLY_RULE,
      'LLM 场景下 crudConfig 中的 transformRequest/transformResponse 应省略，不要尝试传函数。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先创建目标表，或确认 tableName。',
      },
      {
        code: 'INVALID_UPDATE',
        when: '列更新、API 配置或 defaultRows 与当前 schema 冲突',
        fix: '拆分成多个小更新动作，逐步定位失败点。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.renameTable',
    target: 'table',
    crudToolMethod: 'renameTable',
    description: '重命名数据表，并同步更新视图、关系、依赖与布局引用',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      newTableName: 'string — 新表名，DataSet 内唯一',
    },
    resultSchema: {
      table: 'DataTable — 重命名后的数据表实例',
    },
    example: {
      tableName: 'Users',
      newTableName: 'CustomerUsers',
    },
    validation: { requiredKeys: ['tableName', 'newTableName'] },
    usageRules: [
      '仅用于表身份变更；普通资源语义、API 或列结构修改仍优先用 datasetTool.updateTable。',
      '会同步改写表级 views.tableName、tableRelations、viewDependencies 与 layout.tablePositions 中的表名引用。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认 tableName，或先执行 datasetTool.listTables。',
      },
      {
        code: 'TABLE_ALREADY_EXISTS',
        when: 'newTableName 已被其他表占用',
        fix: '换一个未占用的新表名，或先处理冲突表。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.deleteTable',
    target: 'table',
    crudToolMethod: 'deleteTable',
    description: '删除指定数据表',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
    },
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      tableName: 'LegacyUsers',
    },
    validation: { requiredKeys: ['tableName'] },
    usageRules: [
      '当表仍被 relation 或 dependency 引用时，底层会 fail-fast 拒绝删除。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'TABLE_REFERENCED',
        when: '表仍被 relation 或 dependency 引用',
        fix: '先删除关系和依赖，再删除表。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'datasetTool.listViews',
    target: 'view',
    crudToolMethod: 'listViews',
    description: '列出指定表下的全部视图',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
    },
    resultSchema: {
      views: 'DataView[] — 视图实例列表',
    },
    example: {
      tableName: 'Users',
    },
    validation: { requiredKeys: ['tableName'] },
    usageRules: [
      '返回值包含 default 视图。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先执行 datasetTool.listTables。',
      },
    ],
    currentStillAction: DATAVIEW_DESCRIBE_ACTION,
  }),
  defineDescribeRow({
    action: 'datasetTool.getView',
    target: 'view',
    crudToolMethod: 'getView',
    description: '获取指定视图',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      view: 'DataView | undefined — 命中的视图',
    },
    example: {
      tableName: 'Users',
      viewId: 'grid',
    },
    validation: { requiredKeys: ['tableName'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      '若该视图配置了 aggregates，运行时汇总结果位于 view.summaryRow / view.selectionSummaryRow。',
      'UI 侧引用聚合结果时，优先使用 DataKey：TableName@summaryRow、TableName@selectionSummaryRow、TableName@viewId@summaryRow，或继续追加字段路径如 Orders@summaryRow.totalAmount。',
      '不存在时返回 undefined，而不是抛错。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
    currentStillAction: DATAVIEW_DESCRIBE_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.createView',
    target: 'view',
    crudToolMethod: 'createView',
    description: '创建一个非 default 视图',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: 'string — 新视图 ID，不能是 default',
      config: VIEW_METADATA_SCHEMA,
    },
    resultSchema: {
      view: 'DataView — 新创建的视图实例',
    },
    example: {
      tableName: 'Users',
      viewId: 'grid',
      config: {
        pageSize: 50,
        aggregates: {
          rowCount: { type: 'count', field: 'id', label: '行数' },
          totalScore: { type: 'sum', field: 'score', label: '总分' },
          avgScore: { type: 'avg', field: 'score', label: '平均分' },
          minScore: { type: 'min', field: 'score', label: '最低分' },
          maxScore: { type: 'max', field: 'score', label: '最高分' },
          nameList: { type: 'join', field: 'name', separator: ' / ', label: '姓名列表' },
        },
      },
    },
    validation: { requiredKeys: ['tableName', 'viewId'] },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_LIFECYCLE_RULE,
      STATIC_ROWS_ONLY_RULE,
      '如需配置聚合，请在 config.aggregates 中声明输出键 -> 聚合配置；这是对象映射（Record/Map-like），不是数组；不要把 summaryRow 当作可直接写入 rows 的静态字段。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'DEFAULT_VIEW_ALREADY_EXISTS',
        when: '尝试创建 default 视图',
        fix: '改用 datasetTool.updateView 更新 default 视图。',
      },
    ],
    currentStillAction: DATAVIEW_CREATE_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.updateView',
    target: 'view',
    crudToolMethod: 'updateView',
    description: '更新指定视图的元数据配置',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      updates: VIEW_METADATA_SCHEMA,
    },
    resultSchema: {
      view: 'DataView — 更新后的视图实例',
    },
    example: {
      tableName: 'Users',
      viewId: 'grid',
      updates: {
        page: 3,
        pageSize: 50,
        aggregates: {
          rowCount: { type: 'count', field: 'id', label: '行数' },
          totalScore: { type: 'sum', field: 'score', label: '总分' },
          avgScore: { type: 'avg', field: 'score', label: '平均分' },
          minScore: { type: 'min', field: 'score', label: '最低分' },
          maxScore: { type: 'max', field: 'score', label: '最高分' },
          selectedNames: { type: 'join', field: 'name', separator: ' / ', label: '姓名列表' },
        },
      },
    },
    validation: { requiredKeys: ['tableName', 'updates'] },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      STATIC_ROWS_ONLY_RULE,
      '如果 updates.rows 存在，会先 replaceRows，再 applyViewConfig。',
      '如需新增或修改聚合，统一写在 updates.aggregates；这是对象映射（Record/Map-like），输出键会成为 summaryRow / selectionSummaryRow 上的字段名。',
      '聚合配置生效后，UI 侧可用 TableName@summaryRow、TableName@selectionSummaryRow、TableName@viewId@summaryRow，或字段路径 TableName@summaryRow.totalScore 进行绑定。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 datasetTool.listViews 或 datasetTool.createView。',
      },
    ],
    currentStillAction: DATAVIEW_CONFIGURE_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.deleteView',
    target: 'view',
    crudToolMethod: 'deleteView',
    description: '删除指定视图',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: 'string — 视图 ID，不能是 default',
    },
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      tableName: 'Users',
      viewId: 'grid',
    },
    validation: { requiredKeys: ['tableName', 'viewId'] },
    usageRules: [
      DEFAULT_VIEW_LIFECYCLE_RULE,
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'DEFAULT_VIEW_CANNOT_DELETE',
        when: '尝试删除 default 视图',
        fix: '保留 default 视图，仅删除命名视图。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'datasetTool.listRows',
    target: 'row',
    crudToolMethod: 'listRows',
    description: '列出指定视图当前持有的全部行',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      rows: 'IDataRow[] — 行数组副本',
    },
    example: {
      tableName: 'Users',
      viewId: 'default',
    },
    validation: { requiredKeys: ['tableName'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      '读取的是当前视图行集，不一定等于 DataTable.rows 全量源数据。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 datasetTool.getView 或 datasetTool.createView。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'datasetTool.getRow',
    target: 'row',
    crudToolMethod: 'getRow',
    description: '按主键查找一条行数据，支持树形 children 递归扫描',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      id: ROW_ID_PARAM,
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      row: 'IDataRow | undefined — 命中的行数据',
    },
    example: {
      tableName: 'Users',
      id: 1,
      viewId: 'default',
    },
    validation: { requiredKeys: ['tableName', 'id'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      '树形 children 会递归扫描，不需要调用方区分平铺表和树表。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
  }),
  defineRequestRow({
    action: 'datasetTool.createRow',
    target: 'row',
    crudToolMethod: 'createRow',
    description: '在指定视图中创建一条新行',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      data: ROW_DATA_SCHEMA,
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      result: 'IDataRow | CrudResult<IDataRow> — 本地/远端双返回形态',
    },
    example: {
      tableName: 'Users',
      data: { id: 2, name: 'Bob' },
    },
    validation: { requiredKeys: ['tableName', 'data'] },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      REMOTE_ROW_RESULT_RULE,
      '无远端 API 的 default 视图会同步回 DataTable.rows。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'ROW_CREATE_FAILED',
        when: '本地校验失败或远端创建失败',
        fix: '检查 data 是否满足列定义与主键约束。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.createRows',
    target: 'row',
    crudToolMethod: 'createRows',
    description: '批量创建多条行数据',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      items: ROW_ARRAY_SCHEMA,
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      result: 'CrudResult<BatchResult> — 批量创建结果（含 successCount/failureCount）',
    },
    example: {
      tableName: 'Users',
      items: [
        { id: 3, name: 'Alice' },
        { id: 4, name: 'Carol' },
      ],
    },
    validation: { requiredKeys: ['tableName', 'items'] },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      'immediate + API 模式优先走远端 batchCreate；其余模式逐条本地 addRow 并汇总结果。',
      '只有 default view 且无 api 时，才会同步回 DataTable.rows。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'BATCH_CREATE_FAILED',
        when: '批量创建存在失败项',
        fix: '检查 result.data.results 明细，定位失败记录并重试。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.updateRow',
    target: 'row',
    crudToolMethod: 'updateRow',
    description: '更新指定主键的行数据',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      id: ROW_ID_PARAM,
      data: ROW_DATA_SCHEMA,
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      result: 'boolean | CrudResult<IDataRow> — 本地/远端双返回形态',
    },
    example: {
      tableName: 'Users',
      id: 2,
      data: { name: 'Bobby' },
    },
    validation: { requiredKeys: ['tableName', 'id', 'data'] },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      REMOTE_ROW_RESULT_RULE,
      '只有 default view 且无 api 时，才会同步回 DataTable.rows。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'ROW_UPDATE_FAILED',
        when: '目标行不存在或远端更新失败',
        fix: '先执行 datasetTool.getRow 确认目标主键可命中。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.updateRows',
    target: 'row',
    crudToolMethod: 'updateRows',
    description: '批量更新多条行数据',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      items: {
        kind: 'array',
        items: {
          kind: 'object',
          required: ['id', 'data'],
          properties: {
            id: ROW_ID_PARAM,
            data: ROW_DATA_SCHEMA,
          },
        },
      },
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      result: 'CrudResult<BatchResult> — 批量更新结果（含 successCount/failureCount）',
    },
    example: {
      tableName: 'Users',
      items: [
        { id: 3, data: { name: 'Alice Zhang' } },
        { id: 4, data: { name: 'Carol Wang' } },
      ],
    },
    validation: { requiredKeys: ['tableName', 'items'] },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      'immediate + API 模式优先走远端 batchUpdate；其余模式逐条本地 editRowById 并汇总结果。',
      '只有 default view 且无 api 时，才会同步回 DataTable.rows。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'BATCH_UPDATE_FAILED',
        when: '批量更新存在失败项',
        fix: '检查 result.data.results 明细，先确认每条 id 均可命中。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.deleteRow',
    target: 'row',
    crudToolMethod: 'deleteRow',
    description: '删除指定主键的行数据',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      id: ROW_ID_PARAM,
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      result: 'boolean | CrudResult<boolean> — 本地/远端双返回形态',
    },
    example: {
      tableName: 'Users',
      id: 1,
    },
    validation: { requiredKeys: ['tableName', 'id'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      REMOTE_ROW_RESULT_RULE,
      '只有 default view 且无 api 时，才会同步回 DataTable.rows。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'ROW_DELETE_FAILED',
        when: '目标行不存在或远端删除失败',
        fix: '先执行 datasetTool.getRow 确认目标主键可命中。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.deleteRows',
    target: 'row',
    crudToolMethod: 'deleteRows',
    description: '批量删除多条行数据',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      ids: 'Array<string | number> — 需要删除的主键数组',
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      result: 'CrudResult<BatchResult> — 批量删除结果（含 successCount/failureCount）',
    },
    example: {
      tableName: 'Users',
      ids: [3, 4],
    },
    validation: { requiredKeys: ['tableName', 'ids'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      'immediate + API 模式优先走远端 batchDelete；其余模式逐条本地 removeRow 并汇总结果。',
      '只有 default view 且无 api 时，才会同步回 DataTable.rows。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'BATCH_DELETE_FAILED',
        when: '批量删除存在失败项',
        fix: '检查 result.data.results 明细，定位不存在或删除失败的 id。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'datasetTool.listRelations',
    target: 'relation',
    crudToolMethod: 'listRelations',
    description: '列出 DataSet 中的表关系，可按 parentTable 或 childTable 过滤',
    paramsSchema: {
      parentTable: 'string? — 可选父表过滤条件',
      childTable: 'string? — 可选子表过滤条件',
    },
    resultSchema: {
      relations: 'TableRelation[] — 命中的关系列表',
    },
    example: {
      parentTable: 'Orders',
    },
    usageRules: [
      'filter 只支持按 parentTable 和 childTable 过滤。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
    currentStillAction: RELATION_LIST_ACTION,
  }),
  defineDescribeRow({
    action: 'datasetTool.getRelation',
    target: 'relation',
    crudToolMethod: 'getRelation',
    description: '获取单条表关系；命中多条关系时要求字段级消歧',
    paramsSchema: {
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      parentField: 'string? — 父表字段，用于消歧',
      childField: 'string? — 子表字段，用于消歧',
    },
    resultSchema: {
      relation: 'TableRelation | undefined — 命中的表关系',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    },
    validation: { requiredKeys: ['parentTable', 'childTable'] },
    usageRules: [
      RELATION_AMBIGUITY_RULE,
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'AMBIGUOUS_RELATION',
        when: '同一父子表命中多条关系但未提供字段级 selector',
        fix: '补充 parentField 与 childField。',
      },
    ],
    currentStillAction: RELATION_LIST_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.createRelation',
    target: 'relation',
    crudToolMethod: 'createRelation',
    description: '创建一条表关系',
    paramsSchema: {
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      parentField: 'string — 父表匹配字段',
      childField: 'string — 子表外键字段',
      relationName: 'string? — 可选关系名',
    },
    resultSchema: {
      relation: 'TableRelation — 新创建的表关系',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    },
    validation: { requiredKeys: ['parentTable', 'childTable', 'parentField', 'childField'] },
    usageRules: [
      '父表、子表和字段都必须已经存在。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'INVALID_RELATION',
        when: '父子表或字段不存在，或关系重复',
        fix: '先核对 schema，再创建关系。',
      },
    ],
    currentStillAction: RELATION_ADD_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.updateRelation',
    target: 'relation',
    crudToolMethod: 'updateRelation',
    description: '更新一条表关系',
    paramsSchema: {
      selector: RELATION_SELECTOR_SCHEMA,
      updates: RELATION_UPDATE_SCHEMA,
    },
    resultSchema: {
      relation: 'TableRelation — 更新后的表关系',
    },
    example: {
      selector: { parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' },
      updates: { relationName: 'order-items' },
    },
    validation: { requiredKeys: ['selector', 'updates'] },
    usageRules: [
      JSON_OBJECT_RULE,
      RELATION_AMBIGUITY_RULE,
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'RELATION_NOT_FOUND',
        when: '选择器未命中现有关系',
        fix: '先执行 datasetTool.listRelations 或 datasetTool.getRelation。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.deleteRelation',
    target: 'relation',
    crudToolMethod: 'deleteRelation',
    description: '删除一条表关系（单一签名：关系选择器）',
    paramsSchema: {
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      parentField: 'string? — 同一父子表有多条关系时建议显式提供',
      childField: 'string? — 同一父子表有多条关系时建议显式提供',
    },
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    },
    validation: { requiredKeys: ['parentTable', 'childTable'] },
    usageRules: [
      JSON_OBJECT_RULE,
      RELATION_AMBIGUITY_RULE,
      '同一父子表存在多条关系时，必须补 parentField 与 childField 消歧。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'AMBIGUOUS_RELATION',
        when: '按 parentTable + childTable 删除但存在多条关系',
        fix: '改用 selector，并补 parentField 与 childField。',
      },
    ],
    currentStillAction: RELATION_REMOVE_ACTION,
  }),
  defineDescribeRow({
    action: 'datasetTool.listDependencies',
    target: 'dependency',
    crudToolMethod: 'listDependencies',
    description: '列出 DataSet 中的视图依赖，可按 parentTable 或 childTable 过滤',
    paramsSchema: {
      parentTable: 'string? — 可选父表过滤条件',
      childTable: 'string? — 可选子表过滤条件',
    },
    resultSchema: {
      dependencies: 'ViewDependency[] — 命中的依赖列表',
    },
    example: {
      parentTable: 'Orders',
    },
    usageRules: [
      'filter 只支持按 parentTable 和 childTable 过滤。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
  }),
  defineDescribeRow({
    action: 'datasetTool.getDependency',
    target: 'dependency',
    crudToolMethod: 'getDependency',
    description: '获取一条视图依赖',
    paramsSchema: {
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
    },
    resultSchema: {
      dependency: 'ViewDependency | undefined — 命中的依赖',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
    },
    validation: { requiredKeys: ['parentTable', 'childTable'] },
    usageRules: [
      '不存在时返回 undefined。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
  }),
  defineRequestRow({
    action: 'datasetTool.createDependency',
    target: 'dependency',
    crudToolMethod: 'createDependency',
    description: '创建一条视图依赖',
    paramsSchema: {
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      dependencyType: DEPENDENCY_TYPE_PARAM,
      autoLoad: 'boolean? — 父变化时是否自动级联加载子视图',
    },
    resultSchema: {
      dependency: 'ViewDependency — 新创建的依赖',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
      dependencyType: 'currentRow',
      autoLoad: true,
    },
    validation: { requiredKeys: ['parentTable', 'childTable'] },
    usageRules: [
      '底层 relation 必须已经存在，否则依赖创建会失败。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'INVALID_DEPENDENCY',
        when: '依赖引用非法或缺少底层 relation',
        fix: '先创建表关系，再创建依赖。',
      },
    ],
    currentStillAction: DEPENDENCY_ADD_ACTION,
  }),
  defineRequestRow({
    action: 'datasetTool.updateDependency',
    target: 'dependency',
    crudToolMethod: 'updateDependency',
    description: '更新一条视图依赖',
    paramsSchema: {
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      updates: VIEW_DEPENDENCY_UPDATE_SCHEMA,
    },
    resultSchema: {
      dependency: 'ViewDependency — 更新后的依赖',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
      updates: { dependencyType: 'selectedRows', autoLoad: false },
    },
    validation: { requiredKeys: ['parentTable', 'childTable', 'updates'] },
    usageRules: [
      JSON_OBJECT_RULE,
      '只更新现有依赖，不会隐式创建新依赖。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'DEPENDENCY_NOT_FOUND',
        when: '目标依赖不存在',
        fix: '先执行 datasetTool.getDependency 或 datasetTool.createDependency。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.deleteDependency',
    target: 'dependency',
    crudToolMethod: 'deleteDependency',
    description: '删除一条视图依赖',
    paramsSchema: {
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
    },
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
    },
    validation: { requiredKeys: ['parentTable', 'childTable'] },
    usageRules: [
      '依赖不存在时底层会抛错。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'DEPENDENCY_NOT_FOUND',
        when: '目标依赖不存在',
        fix: '先执行 datasetTool.getDependency。',
      },
    ],
    currentStillAction: DEPENDENCY_REMOVE_ACTION,
  }),
  defineDescribeRow({
    action: 'datasetTool.listAggregates',
    target: 'view',
    crudToolMethod: 'listAggregates',
    description: '列出指定视图当前的全部聚合配置',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
    },
    resultSchema: {
      aggregates: 'Record<string, AggregateColumnConfig> — 聚合配置浅拷贝，键为聚合输出字段名',
    },
    example: {
      tableName: 'Orders',
      viewId: 'default',
    },
    validation: { requiredKeys: ['tableName'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      '聚合配置按 viewId 隔离：同一 table 在不同视图可维护不同 aggregates，不会互相覆盖。',
      'aggregates 是 MAP 结构：{ [key]: config }；key 是输出字段名，运行时聚合值按 summaryRow[key] / selectionSummaryRow[key] 读取。',
      '返回值是配置态快照，不含运行时计算结果（summaryRow / selectionSummaryRow）。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 datasetTool.listViews 确认视图存在。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'datasetTool.getAggregate',
    target: 'view',
    crudToolMethod: 'getAggregate',
    description: '获取指定视图中单条聚合配置',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      key: 'string — 聚合输出字段名（即 aggregates 对象的键）',
    },
    resultSchema: {
      aggregate: 'AggregateColumnConfig | undefined — 命中的聚合配置；不存在时为 undefined',
    },
    example: {
      tableName: 'Orders',
      key: 'totalAmount',
    },
    validation: { requiredKeys: ['tableName', 'key'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      '不存在时返回 undefined，而不是抛错。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 datasetTool.listViews 确认视图存在。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.addAggregate',
    target: 'view',
    crudToolMethod: 'addAggregate',
    description: '向指定视图新增一条聚合配置',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      key: 'string — 聚合输出字段名，视图内唯一',
      config: AGGREGATE_ITEM_SCHEMA,
    },
    resultSchema: {
      added: 'void — 写入成功后无返回值',
    },
    example: {
      tableName: 'Orders',
      key: 'totalAmount',
      config: { type: 'sum', field: 'amount', label: '合计金额' },
    },
    validation: { requiredKeys: ['tableName', 'key', 'config'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      JSON_OBJECT_RULE,
      '视图聚合新增步骤：先选 viewId（不传即 default）→ 指定 key（输出字段名）→ 设 config.type（sum/count/avg/min/max/join）与 field。',
      'MAP 引用规则：key 决定结果落点，config.field 只决定聚合源字段；例如 key=totalAmount 且 field=amount，读取仍用 summaryRow.totalAmount。',
      '新增后在容器侧从 summaryRow[key]（全量）或 selectionSummaryRow[key]（选中集）读取聚合结果。',
      'key 已存在时抛错，改用 datasetTool.updateAggregate。',
      'config.field 省略时默认与 key 同名，该字段必须在列定义中存在。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'AGGREGATE_KEY_EXISTS',
        when: 'key 已存在于当前视图聚合配置',
        fix: '改用 datasetTool.updateAggregate，或先执行 datasetTool.removeAggregate。',
      },
      {
        code: 'UNKNOWN_FIELD',
        when: 'config.field（或 key）不在列定义中',
        fix: '先执行 datasetTool.listColumns 确认字段存在，或补充正确 field 值。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.updateAggregate',
    target: 'view',
    crudToolMethod: 'updateAggregate',
    description: '更新指定视图中一条已有聚合配置（浅合并 updates）',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      key: 'string — 聚合输出字段名',
      updates: {
        kind: 'object',
        optional: {
          type: '"sum" | "count" | "avg" | "min" | "max" | "join"',
          field: 'string? — 新源字段名',
          label: 'string? — 新 UI 标题',
          separator: 'string? — join 分隔符',
        },
      },
    },
    resultSchema: {
      updated: 'void — 写入成功后无返回值',
    },
    example: {
      tableName: 'Orders',
      key: 'totalAmount',
      updates: { label: '订单合计' },
    },
    validation: { requiredKeys: ['tableName', 'key', 'updates'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      JSON_OBJECT_RULE,
      '可通过 updates.type 在 sum/count/avg/min/max/join 间切换；join 类型可同时传 updates.separator。',
      '若修改 updates.field，只会改变聚合来源，不会改变结果引用 key；读取仍使用 summaryRow[key]。',
      'key 不存在时抛错，改用 datasetTool.addAggregate。',
      '只传需要修改的字段；未传字段保留原值。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'AGGREGATE_KEY_NOT_FOUND',
        when: 'key 不存在于当前视图聚合配置',
        fix: '先执行 datasetTool.listAggregates，或改用 datasetTool.addAggregate 新增。',
      },
      {
        code: 'UNKNOWN_FIELD',
        when: 'updates.field 不在列定义中',
        fix: '先执行 datasetTool.listColumns 确认字段存在。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.removeAggregate',
    target: 'view',
    crudToolMethod: 'removeAggregate',
    description: '删除指定视图中一条聚合配置',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      key: 'string — 聚合输出字段名',
    },
    resultSchema: {
      removed: 'void — 删除成功后无返回值',
    },
    example: {
      tableName: 'Orders',
      key: 'totalAmount',
    },
    validation: { requiredKeys: ['tableName', 'key'] },
    usageRules: [
      DEFAULT_VIEW_RULE,
      'key 不存在时抛错。',
      '删除后对应 summaryRow / selectionSummaryRow 字段会立即消失。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'AGGREGATE_KEY_NOT_FOUND',
        when: 'key 不存在于当前视图聚合配置',
        fix: '先执行 datasetTool.listAggregates 确认 key 存在。',
      },
    ],
  }),
  defineDescribeRow({
    action: 'datasetTool.getComputeExpression',
    target: 'column',
    crudToolMethod: 'getComputeExpression',
    description: '获取指定列的计算表达式字符串',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
    },
    resultSchema: {
      expression: 'string | undefined — 当前计算表达式；未配置时为 undefined',
    },
    example: {
      tableName: 'Orders',
      columnName: 'totalAmount',
    },
    validation: { requiredKeys: ['tableName', 'columnName'] },
    usageRules: [
      '未配置计算表达式时返回 undefined，而不是抛错。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先执行 datasetTool.listTables 确认表存在。',
      },
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 datasetTool.listColumns 确认列存在。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.setComputeExpression',
    target: 'column',
    crudToolMethod: 'setComputeExpression',
    description: '设置（或替换）指定列的计算表达式；设置后自动重编译并对现有行立即重算',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
      expression: {
        type: 'string',
        maxLength: 2048,
        description: '计算表达式字符串',
        syntax: {
          fieldRef: "直接写字段名（无需任何前缀）。行对象通过 with(__row) 解构，字段直接可见。例：price * qty / status === 'active' ? 1 : 0",
          ctxRef: "ctx.<key> — 引用外部上下文变量，需先调用 DataView.setComputedContext({ key: value }) 注入。例：amount * ctx.taxRate",
          childAgg: {
            note: '子表聚合函数；需父子表已通过 datasetTool.createRelation 建立 TableRelation，否则子行为空',
            childRef: "'子表名' 或 '子表名@视图ID'；省略视图 ID 时取 default 视图",
            functions: [
              '$sum(childRef, field) → number（无行时返回 0）',
              '$count(childRef) → number',
              '$avg(childRef, field) → number（无行时返回 0）',
              '$min(childRef, field) → number | undefined',
              '$max(childRef, field) → number | undefined',
              '$list(childRef, field) → unknown[]',
              "$join(childRef, field, sep?) → string；sep 默认 ', '",
            ],
            examples: [
              "$sum('Items', 'lineTotal')  — 汇总子订单行金额",
              "$count('Items')  — 统计子行数量",
              "$avg('Items', 'lineTotal')  — 子行金额平均值",
              "$min('Items', 'lineTotal')  — 子行金额最小值",
              "$max('Items', 'lineTotal')  — 子行金额最大值",
              "$list('Items', 'sku')  — 收集子行 SKU 列表",
              "$join('Tags', 'name', ' / ')  — 拼接标签名",
              "$sum('Items@filtered', 'amount')  — 使用 Items 表的 filtered 视图",
            ],
          },
          singleVsBlock: {
            single: '不含 return 关键字 → 整体视为单一表达式，自动 return。例：price * qty',
            block: '含 return 关键字 → 视为函数体，每条分支须显式 return。例：if (qty > 0) { return price * qty } else { return 0 }',
            multiStatementExample: 'const tax = amount * 0.13\nreturn amount + tax',
          },
          errorHandling: '运行期求值失败时列值写 undefined，不中断其他行；编译期语法错误在调用时立即抛出',
        },
      },
    },
    resultSchema: {
      table: 'DataTable — 更新后的数据表实例',
    },
    example: {
      simple: {
        tableName: 'Orders',
        columnName: 'totalAmount',
        expression: 'quantity * unitPrice',
      },
      withCtx: {
        tableName: 'Orders',
        columnName: 'taxAmount',
        expression: 'totalAmount * ctx.taxRate',
        note: '需先调用 DataView.setComputedContext({ taxRate: 0.13 })',
      },
      childAggCount: {
        tableName: 'Orders',
        columnName: 'itemCount',
        expression: "$count('Items')",
        note: 'Orders → Items 关系须已建立',
      },
      childAggSum: {
        tableName: 'Orders',
        columnName: 'subTotal',
        expression: "$sum('Items', 'lineTotal')",
      },
      multiStatement: {
        tableName: 'Products',
        columnName: 'discountedPrice',
        expression: "if (stock > 100) { return price * 0.9 } else { return price }",
      },
    },
    validation: { requiredKeys: ['tableName', 'columnName', 'expression'] },
    usageRules: [
      '行字段直接写字段名（无需前缀）；外部变量写 ctx.<key>；子表聚合写 $sum/$count/$avg/$min/$max/$list/$join。',
      '不含 return → 整体自动 return；含 return → 函数体模式，所有分支须显式 return。',
      '$avg/$sum/$count 在空子表时返回 0；$min/$max 在空子表时返回 undefined；$list 返回数组；$join 返回字符串。',
      '子表聚合依赖 TableRelation；无关系时子行数组为空，$sum/$avg/$count 返回 0/$join 返回空字符串。',
      '设置后自动触发 DataTable 刷新链：计算列重编译 → 现有行立即重算 → 聚合行同步更新。',
      '要移除表达式，改用 datasetTool.clearComputeExpression。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先执行 datasetTool.listTables 确认表存在。',
      },
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 datasetTool.listColumns 确认列存在。',
      },
      {
        code: 'EXPRESSION_COMPILE_ERROR',
        when: '表达式字符串语法错误（括号不匹配、超出 2048 字符等）',
        fix: '检查括号匹配、字段名拼写、子表名格式；多语句体须确保每条路径都有 return。',
      },
    ],
  }),
  defineRequestRow({
    action: 'datasetTool.clearComputeExpression',
    target: 'column',
    crudToolMethod: 'clearComputeExpression',
    description: '移除指定列的计算表达式，恢复为普通列（值保留，但不再重算）',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
    },
    resultSchema: {
      table: 'DataTable — 更新后的数据表实例',
    },
    example: {
      tableName: 'Orders',
      columnName: 'totalAmount',
    },
    validation: { requiredKeys: ['tableName', 'columnName'] },
    usageRules: [
      '移除表达式后列变为普通列，现有行的列值保留最后一次计算结果，不再自动重算。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先执行 datasetTool.listTables 确认表存在。',
      },
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 datasetTool.listColumns 确认列存在。',
      },
    ],
  }),
] as const satisfies readonly DatasetCrudToolStillParameterRow[]

/**
 * 能力表：面向 stills.capabilities 这类目录视图的摘要数据。
 *
 * 它不重复存完整规格，只保留列表页需要的字段，并通过 paramsRef 指回参数表。
 */
export const DATASET_CRUD_TOOL_STILLS_CAPABILITY_TABLE: readonly DatasetCrudToolStillCapabilityRow[] =
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE.map(toCapabilityRow)

/** 按 action 查询参数表记录，供未来 actionSpec adapter 或测试复用。 */
export function getDataSetCrudToolStillParameterRow(action: string): DatasetCrudToolStillParameterRow | undefined {
  return DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE.find(row => row.action === action)
}

/** 按 action 查询能力表记录，供未来 capabilities 目录页或适配层复用。 */
export function getDataSetCrudToolStillCapabilityRow(action: string): DatasetCrudToolStillCapabilityRow | undefined {
  return DATASET_CRUD_TOOL_STILLS_CAPABILITY_TABLE.find(row => row.action === action)
}

/** 校验 LLM 提交的 datasetTool 动作参数；通过返回 null，失败返回错误描述字符串。 */
export function validateDataSetCrudToolStillParams(action: string, params: unknown): string | null {
  const row = getDataSetCrudToolStillParameterRow(action)
  if (row === undefined) {
    return `未知 datasetTool 动作: ${action}`
  }

  const validationRule = row.validation
  const result = validateLlmDeserializedParams(params, row.paramsSchema, {
    ...(validationRule?.requiredKeys ? { requiredKeys: validationRule.requiredKeys } : {}),
    ...(validationRule?.oneOfRequiredKeyGroups
      ? { oneOfRequiredKeyGroups: validationRule.oneOfRequiredKeyGroups }
      : {}),
  })
  return result.ok ? null : formatLlmParamValidationIssues(result.issues)
}