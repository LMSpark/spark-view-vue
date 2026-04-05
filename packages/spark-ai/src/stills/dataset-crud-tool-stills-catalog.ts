/**
 * DataSetCrudTool → Future Stills Catalog
 *
 * 目标：
 * 1. 把 DataSetCrudTool 的公开能力整理成 stills.capabilities 可消费的能力表；
 * 2. 把每个动作的参数规格、结果结构、使用规则整理成 stills.actionSpec 可消费的参数表；
 * 3. 先只做目录建模，不注册到现有 stills registry，不影响当前 AI 功能。
 *
 * 约束：
 * - 本文件只提供 catalog，不提供 execute 实现；
 * - DataSetCrudTool 公开方法现已兼容对象参数签名，LLM 可按 paramsSchema 直接调用 crudToolMethod；
 *   旧的位置参数签名仍保持兼容，避免破坏现有调用方；
 * - action 统一使用 datasetTool.* 命名空间，避免与当前 datatable.* / dataview.* stills 冲突；
 * - constructor / dataSet / dataSetName / toJson 不单独暴露给 LLM：
 *   - constructor 由宿主注入；
 *   - dataSet / dataSetName 属于运行时上下文；
 *   - toJson 语义与 datasetTool.export 重合，统一折叠到 datasetTool.export。
 */

import { formatLlmParamValidationIssues, validateLlmDeserializedParams } from './llm-params-validator'

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
  /** 当前阶段固定为 catalog-only，明确尚未接入运行时。 */
  integrationStatus: 'catalog-only'
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
const RESOURCE_TYPE_PARAM = 'TableResourceType? — 资源类型'
const RESOURCE_ID_PARAM = 'string? — 资源 ID'
const BUSINESS_CATEGORY_PARAM = 'TableBusinessCategory? — 业务分类'

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
    type: '"sum" | "count" | "avg" | "min" | "max" | "join"',
    field: 'string? — 源字段名；省略时默认与聚合输出键同名',
    label: 'string? — UI 展示标题',
    separator: 'string? — join 聚合分隔符，仅 type="join" 时有效',
  },
} as const

const AGGREGATES_SCHEMA = {
  kind: 'object',
  additionalProperties: AGGREGATE_ITEM_SCHEMA,
  note: '对象键是聚合输出字段名，例如 totalAmount 或 statusList。',
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
  note: '只传需要的键；如果包含 rows，会先 replaceRows 再应用其他视图配置。',
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

const VIEW_DEPENDENCY_UPDATE_SCHEMA = {
  kind: 'object',
  optional: {
    parentTable: PARENT_TABLE_PARAM,
    childTable: CHILD_TABLE_PARAM,
    dependencyType: 'DependencyType? — 常用 currentRow / selectedRows / allRows / pagedRows',
    autoLoad: 'boolean? — 父变化时是否自动加载子视图',
  },
} as const

// 通用规则描述片段。
const STATIC_ROWS_ONLY_RULE = '只有 resourceType = static-data 时，才应直接通过 rows 或 defaultRows 传静态数据。'
const DEFAULT_VIEW_RULE = '省略 viewId 时默认作用于 default 视图。'
const DEFAULT_VIEW_LIFECYCLE_RULE = 'default 视图不能通过 createView 创建，也不能通过 deleteView 删除。'
const REMOTE_ROW_RESULT_RULE = '行级 request 动作在远端 CRUD 模式下可能返回 CrudResult，本地模式返回本地对象或布尔值。'
const RELATION_AMBIGUITY_RULE = '同一 parentTable + childTable 下存在多条关系时，必须补 parentField 与 childField 做消歧。'
const CATALOG_ONLY_RULE = '本 catalog 当前未注册到 stills registry，只用于未来 LLM 动作映射。'
const JSON_OBJECT_RULE = '对 column/updates/views/api/crudConfig/config/selector 等复杂参数，必须传 JSON 对象，不要传 TypeScript 类型名字符串。'

type DatasetCrudToolStillValidationRule = {
  requiredKeys?: readonly string[]
  oneOfRequiredKeyGroups?: ReadonlyArray<readonly string[]>
}

const DATASET_CRUD_TOOL_STILL_VALIDATION_RULES: Record<string, DatasetCrudToolStillValidationRule> = {
  'datasetTool.getTable': { requiredKeys: ['tableName'] },
  'datasetTool.listColumns': { requiredKeys: ['tableName'] },
  'datasetTool.getColumn': { requiredKeys: ['tableName', 'columnName'] },
  'datasetTool.createColumn': { requiredKeys: ['tableName', 'column'] },
  'datasetTool.updateColumn': { requiredKeys: ['tableName', 'columnName', 'updates'] },
  'datasetTool.deleteColumn': { requiredKeys: ['tableName', 'columnName'] },
  'datasetTool.createTable': { requiredKeys: ['tableName', 'columns'] },
  'datasetTool.updateTable': { requiredKeys: ['tableName'] },
  'datasetTool.deleteTable': { requiredKeys: ['tableName'] },
  'datasetTool.listViews': { requiredKeys: ['tableName'] },
  'datasetTool.getView': { requiredKeys: ['tableName'] },
  'datasetTool.createView': { requiredKeys: ['tableName', 'viewId'] },
  'datasetTool.updateView': { requiredKeys: ['tableName', 'updates'] },
  'datasetTool.deleteView': { requiredKeys: ['tableName', 'viewId'] },
  'datasetTool.listRows': { requiredKeys: ['tableName'] },
  'datasetTool.getRow': { requiredKeys: ['tableName', 'id'] },
  'datasetTool.createRow': { requiredKeys: ['tableName', 'data'] },
  'datasetTool.updateRow': { requiredKeys: ['tableName', 'id', 'data'] },
  'datasetTool.deleteRow': { requiredKeys: ['tableName', 'id'] },
  'datasetTool.getRelation': { requiredKeys: ['parentTable', 'childTable'] },
  'datasetTool.createRelation': { requiredKeys: ['parentTable', 'childTable', 'parentField', 'childField'] },
  'datasetTool.updateRelation': { requiredKeys: ['selector', 'updates'] },
  'datasetTool.deleteRelation': {
    oneOfRequiredKeyGroups: [
      ['selector'],
      ['parentTable', 'childTable'],
    ],
  },
  'datasetTool.getDependency': { requiredKeys: ['parentTable', 'childTable'] },
  'datasetTool.createDependency': { requiredKeys: ['parentTable', 'childTable'] },
  'datasetTool.updateDependency': { requiredKeys: ['parentTable', 'childTable', 'updates'] },
  'datasetTool.deleteDependency': { requiredKeys: ['parentTable', 'childTable'] },
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
    integrationStatus: 'catalog-only',
    paramsRef: row.action,
    ...(row.currentStillAction ? { currentStillAction: row.currentStillAction } : {}),
    ...(row.usageRules.length > 0 ? { rules: row.usageRules } : {}),
    ...(row.failureModes.length > 0 ? { failureCodes: row.failureModes.map(item => item.code) } : {}),
    ...(Object.keys(row.paramsSchema).length > 0 ? { params: row.paramsSchema } : {}),
    ...(Object.keys(row.example).length > 0 ? { example: row.example } : {}),
  }
}

/**
 * 参数表：未来 stills.actionSpec / LLM adapter 的单动作规格数据源。
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
      dataSet: 'IDataSetMetadata — 完整数据集元数据快照',
    },
    example: {},
    usageRules: [
      '返回值应作为只读快照消费，不应直接修改后假定自动回写运行时。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
    currentStillAction: 'dataset.export',
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
    usageRules: [
      '不存在时返回 undefined，而不是抛错。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
    currentStillAction: 'datatable.describe',
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
    currentStillAction: 'datatable.describe',
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
    currentStillAction: 'datatable.describe',
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
    currentStillAction: 'datatable.addColumns',
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
    currentStillAction: 'datatable.updateColumn',
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
    currentStillAction: 'datatable.removeColumn',
  }),
  defineRequestRow({
    action: 'datasetTool.createTable',
    target: 'table',
    crudToolMethod: 'createTable',
    description: '创建数据表，并按需初始化资源语义、API、CRUD 配置和视图',
    paramsSchema: {
      tableName: TABLE_NAME_PARAM,
      columns: DATA_COLUMN_ARRAY_SCHEMA,
      resourceType: RESOURCE_TYPE_PARAM,
      resourceId: RESOURCE_ID_PARAM,
      businessCategory: BUSINESS_CATEGORY_PARAM,
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
    currentStillAction: 'datatable.create',
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
      resourceType: 'TableResourceType | null? — null 表示显式清空',
      resourceId: 'string | null? — null 表示显式清空',
      businessCategory: 'TableBusinessCategory | null? — null 表示显式清空',
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
    currentStillAction: 'dataview.describe',
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
    usageRules: [
      DEFAULT_VIEW_RULE,
      '不存在时返回 undefined，而不是抛错。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [],
    currentStillAction: 'dataview.describe',
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
      config: { pageSize: 50 },
    },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_LIFECYCLE_RULE,
      STATIC_ROWS_ONLY_RULE,
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'DEFAULT_VIEW_ALREADY_EXISTS',
        when: '尝试创建 default 视图',
        fix: '改用 datasetTool.updateView 更新 default 视图。',
      },
    ],
    currentStillAction: 'dataview.create',
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
      updates: { page: 3, pageSize: 50 },
    },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      STATIC_ROWS_ONLY_RULE,
      '如果 updates.rows 存在，会先 replaceRows，再 applyViewConfig。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 datasetTool.listViews 或 datasetTool.createView。',
      },
    ],
    currentStillAction: 'dataview.configure',
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
    currentStillAction: 'relation.list',
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
    currentStillAction: 'relation.list',
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
    currentStillAction: 'relation.add',
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
    description: '删除一条表关系，支持 selector 或 parentTable + childTable 两种签名',
    paramsSchema: {
      selector: RELATION_SELECTOR_SCHEMA,
      parentTable: 'string? — 兼容签名中的父表名',
      childTable: 'string? — 兼容签名中的子表名',
    },
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      selector: { parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId' },
    },
    usageRules: [
      JSON_OBJECT_RULE,
      RELATION_AMBIGUITY_RULE,
      '优先使用 selector 形式，避免按 parentTable + childTable 删除时误命中多条关系。',
      CATALOG_ONLY_RULE,
    ],
    failureModes: [
      {
        code: 'AMBIGUOUS_RELATION',
        when: '按 parentTable + childTable 删除但存在多条关系',
        fix: '改用 selector，并补 parentField 与 childField。',
      },
    ],
    currentStillAction: 'relation.remove',
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
      dependencyType: 'DependencyType? — 依赖类型，默认 currentRow',
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
    currentStillAction: 'dependency.add',
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
    currentStillAction: 'dependency.remove',
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

/**
 * 通用入口：对 LLM 反序列化后的 datasetTool.* 参数做结构校验。
 *
 * 这里不依赖 stills runtime，只消费 catalog 中的 paramsSchema，适合在真正 dispatch 之前做 fail-fast 验证。
 */
export function validateDataSetCrudToolStillParams(action: string, params: unknown): string | null {
  const row = getDataSetCrudToolStillParameterRow(action)
  if (row === undefined) {
    return `未知 datasetTool 动作: ${action}`
  }

  const validationRule = DATASET_CRUD_TOOL_STILL_VALIDATION_RULES[action]
  const result = validateLlmDeserializedParams(params, row.paramsSchema, {
    ...(validationRule?.requiredKeys ? { requiredKeys: validationRule.requiredKeys } : {}),
    ...(validationRule?.oneOfRequiredKeyGroups
      ? { oneOfRequiredKeyGroups: validationRule.oneOfRequiredKeyGroups }
      : {}),
  })
  return result.ok ? null : formatLlmParamValidationIssues(result.issues)
}