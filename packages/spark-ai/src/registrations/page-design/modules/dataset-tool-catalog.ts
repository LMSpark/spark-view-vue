import { type AiFunctionRegistration, type FunctionFailureMode, type IModuleRegistration, anySchema, arraySchema, booleanSchema, enumSchema, noParamsSchema, numberSchema, objectSchema, paramsSchema, stringSchema } from '../../../core'

export type DatasetCrudToolFunctionFailureMode = FunctionFailureMode
export type DatasetCrudToolFunctionId = string

const NO_PARAMS = noParamsSchema('该 dataset 读取函数不接受参数，请传 {} 或留空。')
const TABLE_NAME_PARAM = stringSchema('表名')
const VIEW_ID_PARAM = stringSchema('视图 ID；省略时默认 default')
const COLUMN_NAME_PARAM = stringSchema('列名')
const ROW_ID_PARAM = {
  type: ['string', 'number'],
  description: '主键值',
} as const
const PARENT_TABLE_PARAM = stringSchema('父表名')
const CHILD_TABLE_PARAM = stringSchema('子表名')
const RESOURCE_ID_PARAM = stringSchema('资源 ID')
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
  type: 'string',
  examples: TABLE_RESOURCE_TYPE_RECOMMENDED_VALUES,
  description: '资源类型推荐值字典；优先使用内置资源类型，也允许业务侧自定义字符串。',
} as const

const NULLABLE_RESOURCE_TYPE_SCHEMA = {
  ...RESOURCE_TYPE_SCHEMA,
  type: ['string', 'null'],
  description: '资源类型推荐值字典；传 null 表示显式清空，也允许业务侧自定义字符串。',
} as const

const BUSINESS_CATEGORY_SCHEMA = {
  type: 'string',
  examples: TABLE_BUSINESS_CATEGORY_RECOMMENDED_VALUES,
  description: '业务分类推荐值字典；优先使用 master / child / reference，也允许业务侧自定义字符串。',
} as const

const NULLABLE_BUSINESS_CATEGORY_SCHEMA = {
  ...BUSINESS_CATEGORY_SCHEMA,
  type: ['string', 'null'],
  description: '业务分类推荐值字典；传 null 表示显式清空，也允许业务侧自定义字符串。',
} as const

const DATA_COLUMN_FIELDS_SCHEMA = {
  name: stringSchema('列名，必填，表内唯一'),
  type: stringSchema('ColumnType，必填；常用 string/number/boolean/date/datetime'),
  label: stringSchema('UI 显示标题'),
  isPrimaryKey: booleanSchema('是否主键'),
  allowDBNull: booleanSchema('是否允许 null'),
  defaultValue: anySchema('默认值'),
  autoIncrement: booleanSchema('是否自增'),
  required: booleanSchema('UI 必填标记'),
  minLength: numberSchema('字符串最小长度'),
  maxLength: numberSchema('字符串最大长度'),
  min: numberSchema('数值最小值'),
  max: numberSchema('数值最大值'),
  pattern: stringSchema('正则表达式字符串'),
  patternMessage: stringSchema('正则失败提示'),
  computeExpression: stringSchema('计算列表达式'),
} as const

const DATA_COLUMN_SCHEMA = objectSchema(DATA_COLUMN_FIELDS_SCHEMA, {
  required: ['name', 'type'],
  description: '必须传 JSON 对象，不要把 column 写成 "DataColumn" 之类的类型名字符串。',
})

const PARTIAL_DATA_COLUMN_SCHEMA = objectSchema(DATA_COLUMN_FIELDS_SCHEMA, {
  description: '只传要修改的字段；通常不要在 updates 中修改 name。',
})

const DATA_COLUMN_ARRAY_SCHEMA = arraySchema(DATA_COLUMN_SCHEMA)

const COLUMN_UPDATE_ENTRY_SCHEMA = objectSchema({
  columnName: COLUMN_NAME_PARAM,
  updates: PARTIAL_DATA_COLUMN_SCHEMA,
}, {
  required: ['columnName', 'updates'],
})

const ROW_DATA_SCHEMA = objectSchema({}, {
  additionalProperties: true,
  description: '不要传未声明字段；主键字段必须能被当前表 schema 接受。',
})

const ROW_ARRAY_SCHEMA = arraySchema(ROW_DATA_SCHEMA)

const TREE_CONFIG_SCHEMA = objectSchema({
  idField: stringSchema('节点 id 字段名'),
  parentIdField: stringSchema('父节点 id 字段名'),
  textField: stringSchema('节点文本字段名'),
  depthLimit: numberSchema('最大展开深度'),
  lazy: booleanSchema('是否懒加载'),
  treeMode: enumSchema(['flat', 'nested'], '树数据模式'),
})

const AGGREGATE_ITEM_SCHEMA = objectSchema({
  type: enumSchema(['sum', 'count', 'avg', 'min', 'max', 'join'], '不只有求和；按场景选择计数/平均/极值/字符串拼接'),
  field: stringSchema('源字段名；省略时默认与聚合输出键同名'),
  separator: stringSchema('join 聚合分隔符，仅 type="join" 时有效'),
}, {
  required: ['type'],
})

const AGGREGATES_SCHEMA = objectSchema({}, {
  additionalProperties: AGGREGATE_ITEM_SCHEMA,
  description: '这是 Record<string, AggregateColumnConfig> / Map-like 对象结构，不是数组。对象键就是聚合输出字段名，例如 totalAmount、rowCount、avgScore、minPrice、maxPrice、statusList；配置本身会进入 view.toJson()/fromJson()，而 aggregateResult / selectionAggregateResult 是运行时派生结果。',
})

const VIEW_METADATA_SCHEMA = objectSchema({
  rows: arraySchema(ROW_DATA_SCHEMA, '仅 resourceType = static-data 时才应直接提供'),
  autoCurrentFirst: booleanSchema('请求成功后是否自动聚焦第一行'),
  autoSelectFirst: booleanSchema('请求成功后是否自动选中第一行'),
  page: numberSchema('当前页'),
  pageSize: numberSchema('每页大小'),
  autoLoad: booleanSchema('DataSet 初始化后是否自动加载'),
  commitMode: enumSchema(['immediate', 'staged'], '提交模式'),
  valueField: {
    anyOf: [
      stringSchema('值序列化字段'),
      arraySchema(stringSchema('值序列化字段'), '值序列化字段列表'),
    ],
    description: '值序列化字段',
  },
  labelField: stringSchema('标签字段'),
  selectionDelimiter: stringSchema('多选序列化分隔符；空字符串表示单选'),
  treeConfig: TREE_CONFIG_SCHEMA,
  filterExpression: objectSchema({}, { additionalProperties: true, description: '复杂过滤对象；简单场景建议先省略' }),
  sortExpression: arraySchema(objectSchema({}, { additionalProperties: true }), '例如 [{ field: "createdAt", direction: "desc" }]'),
  aggregates: AGGREGATES_SCHEMA,
}, {
  description: '只传需要的键；如果包含 rows，会先 replaceRows 再应用其他视图配置。若配置 aggregates，完整语义由 aggregates[key] 配置与 aggregateResult[key]/selectionAggregateResult[key] 结果共同组成。UI 可通过 dataViewKey=Table@viewId 且 dataMember=aggregateResult / selectionAggregateResult 引用结果行。',
})

const CRUD_HTTP_ENDPOINT_SCHEMA = objectSchema({
  url: stringSchema('接口地址'),
  method: enumSchema(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], '默认由后端或调用方约定'),
  headers: objectSchema({}, { additionalProperties: stringSchema('请求头值'), description: '请求头' }),
  params: objectSchema({}, { additionalProperties: true, description: '查询参数模板' }),
  pathParams: arraySchema(stringSchema('路径占位参数名'), '路径占位参数名，例如 ["id"]'),
  baseURL: stringSchema('可选 API 基础地址'),
}, {
  required: ['url'],
})

const CRUD_LIST_ENDPOINT_SCHEMA = {
  ...CRUD_HTTP_ENDPOINT_SCHEMA,
  properties: {
    ...CRUD_HTTP_ENDPOINT_SCHEMA.properties,
    pagination: objectSchema({
      pageParam: stringSchema('页码参数名'),
      sizeParam: stringSchema('分页大小参数名'),
      sortParam: stringSchema('排序参数名'),
    }),
  },
} as const

const CRUD_API_SCHEMA = objectSchema({
  list: CRUD_LIST_ENDPOINT_SCHEMA,
  create: CRUD_HTTP_ENDPOINT_SCHEMA,
  retrieve: CRUD_HTTP_ENDPOINT_SCHEMA,
  update: CRUD_HTTP_ENDPOINT_SCHEMA,
  delete: CRUD_HTTP_ENDPOINT_SCHEMA,
  import: CRUD_HTTP_ENDPOINT_SCHEMA,
  export: CRUD_HTTP_ENDPOINT_SCHEMA,
  batch: objectSchema({
    create: CRUD_HTTP_ENDPOINT_SCHEMA,
    update: CRUD_HTTP_ENDPOINT_SCHEMA,
    delete: CRUD_HTTP_ENDPOINT_SCHEMA,
  }),
  node: CRUD_HTTP_ENDPOINT_SCHEMA,
  children: {
    ...CRUD_HTTP_ENDPOINT_SCHEMA,
    properties: {
      ...CRUD_HTTP_ENDPOINT_SCHEMA.properties,
      limit: numberSchema('最大返回子节点数'),
    },
  },
  path: CRUD_HTTP_ENDPOINT_SCHEMA,
  subtree: CRUD_HTTP_ENDPOINT_SCHEMA,
  nestedSearch: CRUD_HTTP_ENDPOINT_SCHEMA,
}, {
  description: '至少提供一个端点；不要把 api 误写成单个 { url, method }，而要按 list/create/update/delete 等键组织。',
})

const CRUD_OPERATION_CONFIG_SCHEMA = objectSchema({
  timeout: numberSchema('超时毫秒数'),
  retryCount: numberSchema('重试次数'),
  skipPermissionCheck: booleanSchema('是否跳过权限检查'),
  validateData: booleanSchema('是否在请求前校验数据'),
  modelPermission: objectSchema({}, { additionalProperties: true, description: '模型级权限快照对象' }),
  instancePermission: objectSchema({}, { additionalProperties: true, description: '实例级权限快照对象' }),
  transformRequest: false,
  transformResponse: false,
}, {
  description: '函数类型字段无法稳定通过协议块传输；LLM 调用时请省略 transformRequest / transformResponse。',
})

const VIEWS_SCHEMA = objectSchema({
  default: VIEW_METADATA_SCHEMA,
}, {
  additionalProperties: VIEW_METADATA_SCHEMA,
  description: '对象键就是 viewId；default 可配置但不会新建，非 default 键会创建对应视图。',
})

const RELATION_SELECTOR_SCHEMA = objectSchema({
  parentTable: PARENT_TABLE_PARAM,
  childTable: CHILD_TABLE_PARAM,
  parentField: stringSchema('同一父子表有多条关系时建议显式提供'),
  childField: stringSchema('同一父子表有多条关系时建议显式提供'),
}, {
  required: ['parentTable', 'childTable'],
  description: '优先传完整 selector，避免关系歧义。',
})

const RELATION_UPDATE_SCHEMA = objectSchema({
  relationName: stringSchema('关系名'),
  parentTable: stringSchema('新父表名'),
  childTable: stringSchema('新子表名'),
  parentField: stringSchema('新父表字段'),
  childField: stringSchema('新子表字段'),
  condition: objectSchema({}, { additionalProperties: true, description: '高级条件，简单场景建议省略' }),
  cascadeUpdate: booleanSchema('是否级联更新'),
  cascadeDelete: booleanSchema('是否级联删除'),
})

const DEPENDENCY_TYPE_RECOMMENDED_VALUES = [
  'currentRow',
  'selectedRows',
  'allRows',
  'pagedRows',
] as const

const DEPENDENCY_TYPE_PARAM = {
  type: 'string',
  examples: DEPENDENCY_TYPE_RECOMMENDED_VALUES,
  description: '父表 default 视图哪类数据变化触发子表 default 视图级联；常用 currentRow / selectedRows / allRows / pagedRows，默认 currentRow。',
} as const

const VIEW_DEPENDENCY_SCHEMA = objectSchema({
  parentTable: PARENT_TABLE_PARAM,
  childTable: CHILD_TABLE_PARAM,
  dependencyType: DEPENDENCY_TYPE_PARAM,
  autoLoad: booleanSchema('父表 default 视图变化时是否自动级联加载子表 default 视图，默认 true'),
}, {
  required: ['parentTable', 'childTable'],
  description: '当前视图依赖；通过 parentTable / childTable 与 tableRelations 对齐，字段绑定来自对应 TableRelation。',
})

const VIEW_DEPENDENCY_UPDATE_SCHEMA = objectSchema({
  parentTable: stringSchema('新的父表名；通常不建议修改'),
  childTable: stringSchema('新的子表名；通常不建议修改'),
  dependencyType: DEPENDENCY_TYPE_PARAM,
  autoLoad: booleanSchema('父表 default 视图变化时是否自动级联加载子表 default 视图'),
})

const STATIC_ROWS_ONLY_RULE = '只有 resourceType = static-data 时，才应直接通过 rows 或 defaultRows 传静态数据。'
const DEFAULT_VIEW_RULE = '省略 viewId 时默认作用于 default 视图。'
const DEFAULT_VIEW_LIFECYCLE_RULE = 'default 视图不能通过 createView 创建，也不能通过 deleteView 删除。'
const REMOTE_ROW_RESULT_RULE = '行级 request 动作在远端 CRUD 模式下可能返回 CrudResult，本地模式返回本地对象或布尔值。'
const RELATION_AMBIGUITY_RULE = '同一 parentTable + childTable 下存在多条关系时，必须补 parentField 与 childField 做消歧。'
const RUNTIME_WIRED_RULE = '该动作直接作用于当前 PageDesignEditHost.getDataSetTool() 返回的 DataSetCrudTool/pagedata.json 模型。'
const JSON_OBJECT_RULE = '对 column/updates/views/api/crudConfig/config/selector 等复杂参数，必须传 JSON 对象，不要传 TypeScript 类型名字符串。'
const VIEW_DEPENDENCY_RULE = 'viewDependencies 使用当前 parentTable / childTable / dependencyType 协议；必须与 tableRelations 中的父子表关系对齐。'

export class DatasetModule implements IModuleRegistration {
  readonly moduleId = 'dataset'
  readonly name = 'Page Design DataSet'
  readonly entity: Record<string, () => unknown> = {}
  readonly prompt = '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。'
  readonly functions: readonly AiFunctionRegistration[] = [
  {
    functionId: 'export',
    description: '导出当前 DataSet 元数据快照',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      dataSet: 'IDataSetMetadata（不含 layout）— 面向 AI 的数据集元数据快照',
    },
    example: {},
    usageRules: [
      '返回值应作为只读快照消费，不应直接修改后假定自动回写运行时。',
      'AI 侧不处理布局字段；layout 由设计器内部维护。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'canUndo',
    description: '读取当前历史栈是否可撤销',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      canUndo: 'boolean — true 表示可执行 dataset.undo',
    },
    example: {},
    usageRules: [
      '建议在调用 dataset.undo 前先检查该值，避免无效操作。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'canRedo',
    description: '读取当前历史栈是否可重做',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      canRedo: 'boolean — true 表示可执行 dataset.redo',
    },
    example: {},
    usageRules: [
      '建议在调用 dataset.redo 前先检查该值，避免无效操作。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'historyCursor',
    description: '读取当前历史游标位置',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      cursor: 'number — 当前快照游标索引（从 0 开始）',
    },
    example: {},
    usageRules: [
      '该值用于调试与可观测性，不建议作为业务分支唯一依据。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'undo',
    description: '撤销最近一次写操作快照',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      dataSet: 'IDataSetMetadata — 撤销后的数据集快照',
    },
    example: {},
    usageRules: [
      '当 canUndo 为 false 时返回 false，不抛错；调用方应按返回值判断。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNDO_NOT_AVAILABLE',
        when: '没有可撤销历史快照',
        fix: '检查返回值；若为 false，先执行至少一次写操作，或跳过 undo。',
      },
    ],
  },
  {
    functionId: 'redo',
    description: '重做最近一次被撤销的写操作快照',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      dataSet: 'IDataSetMetadata — 重做后的数据集快照',
    },
    example: {},
    usageRules: [
      '当 canRedo 为 false 时返回 false，不抛错；调用方应按返回值判断。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'REDO_NOT_AVAILABLE',
        when: '没有可重做历史快照',
        fix: '检查返回值；若为 false，先执行 undo 产生可重做快照，或跳过 redo。',
      },
    ],
  },
  {
    functionId: 'clearHistory',
    description: '清空历史栈并以当前状态重建基线快照',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      cleared: 'boolean — 历史重置完成后视为 true',
    },
    example: {},
    usageRules: [
      '清空后 undo/redo 都会回到不可用状态。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'listTables',
    description: '列出当前 DataSet 的全部数据表',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      tables: 'DataTable[] — 当前数据表列表',
    },
    example: {},
    usageRules: [
      '适合先做能力探测，再决定后续针对哪张表执行 create/update/delete。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'getTable',
    description: '获取指定数据表',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
    }, ['tableName']),
    resultSchema: {
      table: 'DataTable | undefined — 命中的数据表',
    },
    example: {
      tableName: 'Users',
    },
    usageRules: [
      '不存在时返回 undefined，而不是抛错。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'listColumns',
    description: '列出指定表的全部列定义',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
    }, ['tableName']),
    resultSchema: {
      columns: 'DataColumn[] — 列定义数组副本',
    },
    example: {
      tableName: 'Users',
    },
    usageRules: [
      '表不存在时抛错。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认表名，或先执行 dataset.listTables。',
      },
    ],
  },
  {
    functionId: 'getColumn',
    description: '获取指定表中的单个列定义',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
    }, ['tableName', 'columnName']),
    resultSchema: {
      column: 'DataColumn | undefined — 命中的列定义',
    },
    example: {
      tableName: 'Users',
      columnName: 'name',
    },
    usageRules: [
      '表不存在时抛错；列不存在时返回 undefined。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认表名，或先执行 dataset.listTables。',
      },
    ],
  },
  {
    functionId: 'createColumn',
    description: '向指定表追加一列',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      column: DATA_COLUMN_SCHEMA,
    }, ['tableName', 'column']),
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
      RUNTIME_WIRED_RULE,
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
  },
  {
    functionId: 'updateColumn',
    description: '更新指定列定义',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
      updates: PARTIAL_DATA_COLUMN_SCHEMA,
    }, ['tableName', 'columnName', 'updates']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 dataset.getColumn 或 dataset.listColumns。',
      },
    ],
  },
  {
    functionId: 'renameColumn',
    description: '重命名指定列，并同步更新该表视图、静态 rows 与相关关系引用',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
      newColumnName: stringSchema('新列名，表内唯一'),
    }, ['tableName', 'columnName', 'newColumnName']),
    resultSchema: {
      table: 'DataTable — 重命名后的数据表实例',
    },
    example: {
      tableName: 'Users',
      columnName: 'name',
      newColumnName: 'userName',
    },
    usageRules: [
      '仅用于列身份变更；普通元数据修改仍优先用 dataset.updateColumn。',
      '会同步改写当前表 views 中的字段引用、静态 rows 字段键，以及 tableRelations 中的 parentField/childField 引用。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认 tableName，或先执行 dataset.listTables。',
      },
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 dataset.getColumn 或 dataset.listColumns。',
      },
      {
        code: 'COLUMN_ALREADY_EXISTS',
        when: 'newColumnName 在同一表中已存在',
        fix: '换一个未占用的新列名，或先清理冲突列。',
      },
    ],
  },
  {
    functionId: 'deleteColumn',
    description: '删除指定列',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
    }, ['tableName', 'columnName']),
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      tableName: 'Users',
      columnName: 'email',
    },
    usageRules: [
      '删除后会同步刷新 DataView 列缓存。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 dataset.getColumn 或 dataset.listColumns。',
      },
    ],
  },
  {
    functionId: 'createTable',
    description: '创建数据表，并按需初始化资源语义、API、CRUD 配置和视图',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columns: DATA_COLUMN_ARRAY_SCHEMA,
      resourceType: RESOURCE_TYPE_SCHEMA,
      resourceId: RESOURCE_ID_PARAM,
      businessCategory: BUSINESS_CATEGORY_SCHEMA,
      api: CRUD_API_SCHEMA,
      crudConfig: CRUD_OPERATION_CONFIG_SCHEMA,
      views: VIEWS_SCHEMA,
    }, ['tableName', 'columns']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'TABLE_ALREADY_EXISTS',
        when: '同名表已存在',
        fix: '改用 dataset.updateTable 或换一个 tableName。',
      },
      {
        code: 'INVALID_TABLE_CONFIG',
        when: '列定义、视图配置或 API 配置不合法',
        fix: '先缩小到最小可用 schema，再逐步补齐配置。',
      },
    ],
  },
  {
    functionId: 'updateTable',
    description: '更新数据表结构、资源语义及运行配置',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columnsToAdd: DATA_COLUMN_ARRAY_SCHEMA,
      columnUpdates: arraySchema(COLUMN_UPDATE_ENTRY_SCHEMA),
      columnsToRemove: arraySchema(stringSchema('需要删除的列名'), '需要删除的列名列表'),
      api: CRUD_API_SCHEMA,
      crudConfig: {
        ...CRUD_OPERATION_CONFIG_SCHEMA,
        description: '传 null 表示显式移除已有 crudConfig；传对象表示新的运行配置。',
      },
      resourceType: NULLABLE_RESOURCE_TYPE_SCHEMA,
      resourceId: stringSchema('null 表示显式清空', { nullable: true }),
      businessCategory: NULLABLE_BUSINESS_CATEGORY_SCHEMA,
      defaultRows: ROW_ARRAY_SCHEMA,
    }, ['tableName']),
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
      RUNTIME_WIRED_RULE,
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
  },
  {
    functionId: 'renameTable',
    description: '重命名数据表，并同步更新视图、关系、依赖与布局引用',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      newTableName: stringSchema('新表名，DataSet 内唯一'),
    }, ['tableName', 'newTableName']),
    resultSchema: {
      table: 'DataTable — 重命名后的数据表实例',
    },
    example: {
      tableName: 'Users',
      newTableName: 'CustomerUsers',
    },
    usageRules: [
      '仅用于表身份变更；普通资源语义、API 或列结构修改仍优先用 dataset.updateTable。',
      '会同步改写表级 views.tableName、tableRelations、viewDependencies 与 layout.tablePositions 中的表名引用。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先确认 tableName，或先执行 dataset.listTables。',
      },
      {
        code: 'TABLE_ALREADY_EXISTS',
        when: 'newTableName 已被其他表占用',
        fix: '换一个未占用的新表名，或先处理冲突表。',
      },
    ],
  },
  {
    functionId: 'deleteTable',
    description: '删除指定数据表',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
    }, ['tableName']),
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      tableName: 'UsersSample',
    },
    usageRules: [
      '当表仍被 relation 或 dependency 引用时，底层会 fail-fast 拒绝删除。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'TABLE_REFERENCED',
        when: '表仍被 relation 或 dependency 引用',
        fix: '先删除关系和依赖，再删除表。',
      },
    ],
  },
  {
    functionId: 'listViews',
    description: '列出指定表下的全部视图',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
    }, ['tableName']),
    resultSchema: {
      views: 'DataView[] — 视图实例列表',
    },
    example: {
      tableName: 'Users',
    },
    usageRules: [
      '返回值包含 default 视图。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先执行 dataset.listTables。',
      },
    ],
  },
  {
    functionId: 'getView',
    description: '获取指定视图',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
    }, ['tableName']),
    resultSchema: {
      view: 'DataView | undefined — 命中的视图',
    },
    example: {
      tableName: 'Users',
      viewId: 'grid',
    },
    usageRules: [
      DEFAULT_VIEW_RULE,
      '若该视图配置了 aggregates，运行时汇总结果位于 view.aggregateResult / view.selectionAggregateResult。',
      'UI 侧引用聚合结果时，优先使用 dataViewKey + dataMember：dataViewKey=TableName@viewId 且 dataMember=aggregateResult / selectionAggregateResult；字段路径继续放在 dataField，如 totalAmount。',
      '不存在时返回 undefined，而不是抛错。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'createView',
    description: '创建一个非 default 视图',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: stringSchema('新视图 ID，不能是 default'),
      config: VIEW_METADATA_SCHEMA,
    }, ['tableName', 'viewId']),
    resultSchema: {
      view: 'DataView — 新创建的视图实例',
    },
    example: {
      tableName: 'Users',
      viewId: 'grid',
      config: {
        pageSize: 50,
        aggregates: {
          rowCount: { type: 'count', field: 'id' },
          totalScore: { type: 'sum', field: 'score' },
          avgScore: { type: 'avg', field: 'score' },
          minScore: { type: 'min', field: 'score' },
          maxScore: { type: 'max', field: 'score' },
          nameList: { type: 'join', field: 'name', separator: ' / ' },
        },
      },
    },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_LIFECYCLE_RULE,
      STATIC_ROWS_ONLY_RULE,
      '如需配置聚合，请在 config.aggregates 中声明输出键 -> 聚合配置；这是对象映射（Record/Map-like），不是数组；不要把 aggregateResult 当作可直接写入 rows 的静态字段。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'DEFAULT_VIEW_ALREADY_EXISTS',
        when: '尝试创建 default 视图',
        fix: '改用 dataset.updateView 更新 default 视图。',
      },
    ],
  },
  {
    functionId: 'updateView',
    description: '更新指定视图的元数据配置',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      updates: VIEW_METADATA_SCHEMA,
    }, ['tableName', 'updates']),
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
          rowCount: { type: 'count', field: 'id' },
          totalScore: { type: 'sum', field: 'score' },
          avgScore: { type: 'avg', field: 'score' },
          minScore: { type: 'min', field: 'score' },
          maxScore: { type: 'max', field: 'score' },
          selectedNames: { type: 'join', field: 'name', separator: ' / ' },
        },
      },
    },
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      STATIC_ROWS_ONLY_RULE,
      '如果 updates.rows 存在，会先 replaceRows，再 applyViewConfig。',
      '如需新增或修改聚合，统一写在 updates.aggregates；这是对象映射（Record/Map-like），输出键会成为 aggregateResult / selectionAggregateResult 上的字段名。',
      '聚合配置生效后，UI 侧使用 dataViewKey 定位目标 view，使用 dataMember 选择 aggregateResult 或 selectionAggregateResult，使用 dataField 选择聚合字段。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 dataset.listViews 或 dataset.createView。',
      },
    ],
  },
  {
    functionId: 'deleteView',
    description: '删除指定视图',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: stringSchema('视图 ID，不能是 default'),
    }, ['tableName', 'viewId']),
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      tableName: 'Users',
      viewId: 'grid',
    },
    usageRules: [
      DEFAULT_VIEW_LIFECYCLE_RULE,
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'DEFAULT_VIEW_CANNOT_DELETE',
        when: '尝试删除 default 视图',
        fix: '保留 default 视图，仅删除命名视图。',
      },
    ],
  },
  {
    functionId: 'listRows',
    description: '列出指定视图当前持有的全部行',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
    }, ['tableName']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 dataset.getView 或 dataset.createView。',
      },
    ],
  },
  {
    functionId: 'getRow',
    description: '按主键查找一条行数据，支持树形 children 递归扫描',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      id: ROW_ID_PARAM,
      viewId: VIEW_ID_PARAM,
    }, ['tableName', 'id']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'createRow',
    description: '在指定视图中创建一条新行',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      data: ROW_DATA_SCHEMA,
      viewId: VIEW_ID_PARAM,
    }, ['tableName', 'data']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'ROW_CREATE_FAILED',
        when: '本地校验失败或远端创建失败',
        fix: '检查 data 是否满足列定义与主键约束。',
      },
    ],
  },
  {
    functionId: 'createRows',
    description: '批量创建多条行数据',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      items: ROW_ARRAY_SCHEMA,
      viewId: VIEW_ID_PARAM,
    }, ['tableName', 'items']),
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
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      'immediate + API 模式优先走远端 batchCreate；其余模式逐条本地 addRow 并汇总结果。',
      '只有 default view 且无 api 时，才会同步回 DataTable.rows。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'BATCH_CREATE_FAILED',
        when: '批量创建存在失败项',
        fix: '检查 result.data.results 明细，定位失败记录并重试。',
      },
    ],
  },
  {
    functionId: 'updateRow',
    description: '更新指定主键的行数据',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      id: ROW_ID_PARAM,
      data: ROW_DATA_SCHEMA,
      viewId: VIEW_ID_PARAM,
    }, ['tableName', 'id', 'data']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'ROW_UPDATE_FAILED',
        when: '目标行不存在或远端更新失败',
        fix: '先执行 dataset.getRow 确认目标主键可命中。',
      },
    ],
  },
  {
    functionId: 'updateRows',
    description: '批量更新多条行数据',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      items: arraySchema(objectSchema({
        id: ROW_ID_PARAM,
        data: ROW_DATA_SCHEMA,
      }, { required: ['id', 'data'] })),
      viewId: VIEW_ID_PARAM,
    }, ['tableName', 'items']),
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
    usageRules: [
      JSON_OBJECT_RULE,
      DEFAULT_VIEW_RULE,
      'immediate + API 模式优先走远端 batchUpdate；其余模式逐条本地 editRowById 并汇总结果。',
      '只有 default view 且无 api 时，才会同步回 DataTable.rows。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'BATCH_UPDATE_FAILED',
        when: '批量更新存在失败项',
        fix: '检查 result.data.results 明细，先确认每条 id 均可命中。',
      },
    ],
  },
  {
    functionId: 'deleteRow',
    description: '删除指定主键的行数据',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      id: ROW_ID_PARAM,
      viewId: VIEW_ID_PARAM,
    }, ['tableName', 'id']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'ROW_DELETE_FAILED',
        when: '目标行不存在或远端删除失败',
        fix: '先执行 dataset.getRow 确认目标主键可命中。',
      },
    ],
  },
  {
    functionId: 'deleteRows',
    description: '批量删除多条行数据',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      ids: arraySchema(ROW_ID_PARAM, '需要删除的主键数组'),
      viewId: VIEW_ID_PARAM,
    }, ['tableName', 'ids']),
    resultSchema: {
      result: 'CrudResult<BatchResult> — 批量删除结果（含 successCount/failureCount）',
    },
    example: {
      tableName: 'Users',
      ids: [3, 4],
    },
    usageRules: [
      DEFAULT_VIEW_RULE,
      'immediate + API 模式优先走远端 batchDelete；其余模式逐条本地 removeRow 并汇总结果。',
      '只有 default view 且无 api 时，才会同步回 DataTable.rows。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'BATCH_DELETE_FAILED',
        when: '批量删除存在失败项',
        fix: '检查 result.data.results 明细，定位不存在或删除失败的 id。',
      },
    ],
  },
  {
    functionId: 'listRelations',
    description: '列出 DataSet 中的表关系，可按 parentTable 或 childTable 过滤',
    paramsSchema: paramsSchema({
      parentTable: stringSchema('可选父表过滤条件'),
      childTable: stringSchema('可选子表过滤条件'),
    }),
    resultSchema: {
      relations: 'TableRelation[] — 命中的关系列表',
    },
    example: {
      parentTable: 'Orders',
    },
    usageRules: [
      'filter 只支持按 parentTable 和 childTable 过滤。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'getRelation',
    description: '获取单条表关系；命中多条关系时要求字段级消歧',
    paramsSchema: paramsSchema({
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      parentField: stringSchema('父表字段，用于消歧'),
      childField: stringSchema('子表字段，用于消歧'),
    }, ['parentTable', 'childTable']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'AMBIGUOUS_RELATION',
        when: '同一父子表命中多条关系但未提供字段级 selector',
        fix: '补充 parentField 与 childField。',
      },
    ],
  },
  {
    functionId: 'createRelation',
    description: '创建一条表关系',
    paramsSchema: paramsSchema({
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      parentField: stringSchema('父表匹配字段'),
      childField: stringSchema('子表外键字段'),
      relationName: stringSchema('可选关系名'),
    }, ['parentTable', 'childTable', 'parentField', 'childField']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'INVALID_RELATION',
        when: '父子表或字段不存在，或关系重复',
        fix: '先核对 schema，再创建关系。',
      },
    ],
  },
  {
    functionId: 'updateRelation',
    description: '更新一条表关系',
    paramsSchema: paramsSchema({
      selector: RELATION_SELECTOR_SCHEMA,
      updates: RELATION_UPDATE_SCHEMA,
    }, ['selector', 'updates']),
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
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'RELATION_NOT_FOUND',
        when: '选择器未命中现有关系',
        fix: '先执行 dataset.listRelations 或 dataset.getRelation。',
      },
    ],
  },
  {
    functionId: 'deleteRelation',
    description: '删除一条表关系（单一签名：关系选择器）',
    paramsSchema: paramsSchema({
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      parentField: stringSchema('同一父子表有多条关系时建议显式提供'),
      childField: stringSchema('同一父子表有多条关系时建议显式提供'),
    }, ['parentTable', 'childTable']),
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
      parentField: 'id',
      childField: 'orderId',
    },
    usageRules: [
      JSON_OBJECT_RULE,
      RELATION_AMBIGUITY_RULE,
      '同一父子表存在多条关系时，必须补 parentField 与 childField 消歧。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'AMBIGUOUS_RELATION',
        when: '按 parentTable + childTable 删除但存在多条关系',
        fix: '改用 selector，并补 parentField 与 childField。',
      },
    ],
  },
  {
    functionId: 'listDependencies',
    description: '列出 DataSet 中的视图依赖，可按 parentTable 或 childTable 过滤',
    paramsSchema: paramsSchema({
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
    }),
    resultSchema: {
      dependencies: 'ViewDependency[] — 命中的依赖列表',
    },
    example: {
      parentTable: 'Orders',
    },
    usageRules: [
      VIEW_DEPENDENCY_RULE,
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'getDependency',
    description: '获取一条视图依赖',
    paramsSchema: paramsSchema({
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
    }, ['parentTable', 'childTable']),
    resultSchema: {
      dependency: 'ViewDependency | undefined — 命中的依赖',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
    },
    usageRules: [
      '不存在时返回 undefined。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [],
  },
  {
    functionId: 'createDependency',
    description: '创建一条视图依赖',
    paramsSchema: paramsSchema({
      dependency: VIEW_DEPENDENCY_SCHEMA,
    }, ['dependency']),
    resultSchema: {
      dependency: 'ViewDependency — 新创建的依赖',
    },
    example: {
      dependency: {
        parentTable: 'Orders',
        childTable: 'Items',
        dependencyType: 'currentRow',
        autoLoad: true,
      },
    },
    usageRules: [
      VIEW_DEPENDENCY_RULE,
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'INVALID_DEPENDENCY',
        when: '依赖引用非法或找不到对应 tableRelation',
        fix: '先确认 parentTable / childTable 与 tableRelations 中的父子表一致。',
      },
    ],
  },
  {
    functionId: 'updateDependency',
    description: '更新一条视图依赖',
    paramsSchema: paramsSchema({
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
      updates: VIEW_DEPENDENCY_UPDATE_SCHEMA,
    }, ['parentTable', 'childTable', 'updates']),
    resultSchema: {
      dependency: 'ViewDependency — 更新后的依赖',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
      updates: { autoLoad: false },
    },
    usageRules: [
      JSON_OBJECT_RULE,
      VIEW_DEPENDENCY_RULE,
      '只更新现有依赖，不会隐式创建新依赖。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'DEPENDENCY_NOT_FOUND',
        when: '目标依赖不存在',
        fix: '先执行 dataset.getDependency，或确认 parentTable / childTable 后调用 dataset.createDependency。',
      },
    ],
  },
  {
    functionId: 'deleteDependency',
    description: '删除一条视图依赖',
    paramsSchema: paramsSchema({
      parentTable: PARENT_TABLE_PARAM,
      childTable: CHILD_TABLE_PARAM,
    }, ['parentTable', 'childTable']),
    resultSchema: {
      deleted: 'boolean — 删除完成后视为 true',
    },
    example: {
      parentTable: 'Orders',
      childTable: 'Items',
    },
    usageRules: [
      '依赖不存在时底层会抛错。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'DEPENDENCY_NOT_FOUND',
        when: '目标依赖不存在',
        fix: '先执行 dataset.getDependency 确认 parentTable / childTable。',
      },
    ],
  },
  {
    functionId: 'listAggregates',
    description: '列出指定视图当前的全部聚合配置',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
    }, ['tableName']),
    resultSchema: {
      aggregates: 'Record<string, AggregateColumnConfig> — 聚合配置浅拷贝，键为聚合输出字段名',
    },
    example: {
      tableName: 'Orders',
      viewId: 'default',
    },
    usageRules: [
      DEFAULT_VIEW_RULE,
      '聚合配置按 viewId 隔离：同一 table 在不同视图可维护不同 aggregates，不会互相覆盖。',
      'aggregates 是 MAP 结构：{ [key]: config }；key 是输出字段名，config 只记录 type/field/separator，运行时结果按 aggregateResult[key] / selectionAggregateResult[key] 读取。',
      '返回值是配置态快照，不含运行时计算结果（aggregateResult / selectionAggregateResult）。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 dataset.listViews 确认视图存在。',
      },
    ],
  },
  {
    functionId: 'getAggregate',
    description: '获取指定视图中单条聚合配置',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      key: stringSchema('聚合输出字段名（即 aggregates 对象的键）'),
    }, ['tableName', 'key']),
    resultSchema: {
      aggregate: 'AggregateColumnConfig | undefined — 命中的聚合配置；不存在时为 undefined',
    },
    example: {
      tableName: 'Orders',
      key: 'totalAmount',
    },
    usageRules: [
      DEFAULT_VIEW_RULE,
      '不存在时返回 undefined，而不是抛错。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_VIEW',
        when: '目标视图不存在',
        fix: '先执行 dataset.listViews 确认视图存在。',
      },
    ],
  },
  {
    functionId: 'addAggregate',
    description: '向指定视图新增一条聚合配置',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      key: stringSchema('聚合输出字段名，视图内唯一'),
      config: AGGREGATE_ITEM_SCHEMA,
    }, ['tableName', 'key', 'config']),
    resultSchema: {
      added: 'void — 写入成功后无返回值',
    },
    example: {
      tableName: 'Orders',
      key: 'totalAmount',
      config: { type: 'sum', field: 'amount' },
    },
    usageRules: [
      DEFAULT_VIEW_RULE,
      JSON_OBJECT_RULE,
      '视图聚合新增步骤：先选 viewId（不传即 default）→ 指定 key（输出字段名）→ 设 config.type（sum/count/avg/min/max/join）与 field。',
      'MAP 引用规则：key 决定结果落点，config.field 只决定聚合源字段；例如 key=totalAmount 且 field=amount，读取时使用 dataMember=aggregateResult、dataField=totalAmount。',
      '新增后 aggregates[key] 保留配置全貌；容器侧从 aggregateResult[key]（全量）或 selectionAggregateResult[key]（选中集）读取对应聚合结果。',
      'key 已存在时抛错，改用 dataset.updateAggregate。',
      'config.field 省略时默认与 key 同名，该字段必须在列定义中存在。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'AGGREGATE_KEY_EXISTS',
        when: 'key 已存在于当前视图聚合配置',
        fix: '改用 dataset.updateAggregate，或先执行 dataset.removeAggregate。',
      },
      {
        code: 'UNKNOWN_FIELD',
        when: 'config.field（或 key）不在列定义中',
        fix: '先执行 dataset.listColumns 确认字段存在，或补充正确 field 值。',
      },
    ],
  },
  {
    functionId: 'updateAggregate',
    description: '更新指定视图中一条已有聚合配置（浅合并 updates）',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      key: stringSchema('聚合输出字段名'),
      updates: objectSchema({
        type: enumSchema(['sum', 'count', 'avg', 'min', 'max', 'join'], '聚合类型'),
        field: stringSchema('新源字段名'),
        separator: stringSchema('join 分隔符'),
      }),
    }, ['tableName', 'key', 'updates']),
    resultSchema: {
      updated: 'void — 写入成功后无返回值',
    },
    example: {
      tableName: 'Orders',
      key: 'totalAmount',
      updates: { field: 'paidAmount' },
    },
    usageRules: [
      DEFAULT_VIEW_RULE,
      JSON_OBJECT_RULE,
      '可通过 updates.type 在 sum/count/avg/min/max/join 间切换；join 类型可同时传 updates.separator。',
      '若修改 updates.field，只会改变聚合来源，不会改变结果引用 key；读取仍使用 aggregateResult[key]。',
      'key 不存在时抛错，改用 dataset.addAggregate。',
      '只传需要修改的字段；未传字段保留原值。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'AGGREGATE_KEY_NOT_FOUND',
        when: 'key 不存在于当前视图聚合配置',
        fix: '先执行 dataset.listAggregates，或改用 dataset.addAggregate 新增。',
      },
      {
        code: 'UNKNOWN_FIELD',
        when: 'updates.field 不在列定义中',
        fix: '先执行 dataset.listColumns 确认字段存在。',
      },
    ],
  },
  {
    functionId: 'removeAggregate',
    description: '删除指定视图中一条聚合配置',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      viewId: VIEW_ID_PARAM,
      key: stringSchema('聚合输出字段名'),
    }, ['tableName', 'key']),
    resultSchema: {
      removed: 'void — 删除成功后无返回值',
    },
    example: {
      tableName: 'Orders',
      key: 'totalAmount',
    },
    usageRules: [
      DEFAULT_VIEW_RULE,
      'key 不存在时抛错。',
      '删除后对应 aggregateResult / selectionAggregateResult 字段会立即消失。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'AGGREGATE_KEY_NOT_FOUND',
        when: 'key 不存在于当前视图聚合配置',
        fix: '先执行 dataset.listAggregates 确认 key 存在。',
      },
    ],
  },
  {
    functionId: 'getComputeExpression',
    description: '获取指定列的计算表达式字符串',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
    }, ['tableName', 'columnName']),
    resultSchema: {
      expression: 'string | undefined — 当前计算表达式；未配置时为 undefined',
    },
    example: {
      tableName: 'Orders',
      columnName: 'totalAmount',
    },
    usageRules: [
      '未配置计算表达式时返回 undefined，而不是抛错。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先执行 dataset.listTables 确认表存在。',
      },
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 dataset.listColumns 确认列存在。',
      },
    ],
  },
  {
    functionId: 'setComputeExpression',
    description: '设置（或替换）指定列的计算表达式；设置后自动重编译并对现有行立即重算',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
      expression: {
        type: 'string',
        maxLength: 2048,
        description: [
          '计算表达式字符串。',
          '行字段直接写字段名；外部变量写 ctx.<key>。',
          "子表聚合可用 $sum/$count/$avg/$min/$max/$list/$join，例如 $sum('Items', 'lineTotal')。",
          '不含 return 时整体自动 return；含 return 时视为函数体，每条分支须显式 return。',
        ].join(' '),
        examples: [
          'quantity * unitPrice',
          'totalAmount * ctx.taxRate',
          "$count('Items')",
          "if (stock > 100) { return price * 0.9 } else { return price }",
        ],
      },
    }, ['tableName', 'columnName', 'expression']),
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
    usageRules: [
      '行字段直接写字段名（无需前缀）；外部变量写 ctx.<key>；子表聚合写 $sum/$count/$avg/$min/$max/$list/$join。',
      '不含 return → 整体自动 return；含 return → 函数体模式，所有分支须显式 return。',
      '$avg/$sum/$count 在空子表时返回 0；$min/$max 在空子表时返回 undefined；$list 返回数组；$join 返回字符串。',
      '子表聚合依赖 TableRelation；无关系时子行数组为空，$sum/$avg/$count 返回 0/$join 返回空字符串。',
      '设置后自动触发 DataTable 刷新链：计算列重编译 → 现有行立即重算 → 聚合行同步更新。',
      '要移除表达式，改用 dataset.clearComputeExpression。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先执行 dataset.listTables 确认表存在。',
      },
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 dataset.listColumns 确认列存在。',
      },
      {
        code: 'EXPRESSION_COMPILE_ERROR',
        when: '表达式字符串语法错误（括号不匹配、超出 2048 字符等）',
        fix: '检查括号匹配、字段名拼写、子表名格式；多语句体须确保每条路径都有 return。',
      },
    ],
  },
  {
    functionId: 'clearComputeExpression',
    description: '移除指定列的计算表达式，恢复为普通列（值保留，但不再重算）',
    paramsSchema: paramsSchema({
      tableName: TABLE_NAME_PARAM,
      columnName: COLUMN_NAME_PARAM,
    }, ['tableName', 'columnName']),
    resultSchema: {
      table: 'DataTable — 更新后的数据表实例',
    },
    example: {
      tableName: 'Orders',
      columnName: 'totalAmount',
    },
    usageRules: [
      '移除表达式后列变为普通列，现有行的列值保留最后一次计算结果，不再自动重算。',
      RUNTIME_WIRED_RULE,
    ],
    failureModes: [
      {
        code: 'UNKNOWN_TABLE',
        when: '目标表不存在',
        fix: '先执行 dataset.listTables 确认表存在。',
      },
      {
        code: 'UNKNOWN_COLUMN',
        when: '目标列不存在',
        fix: '先执行 dataset.listColumns 确认列存在。',
      },
    ],
  },
  ]
}
