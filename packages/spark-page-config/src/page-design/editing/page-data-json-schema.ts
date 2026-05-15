import {
  canonicalizePageDataJson,
  canonicalizePageDataValue,
} from '../../documents'

export {
  canonicalizePageDataJson,
  canonicalizePageDataValue,
}

export type PageDataEditorMode = 'tree' | 'text' | 'table'

const knownColumnTypes = [
  'number',
  'int',
  'integer',
  'decimal',
  'float',
  'double',
  'string',
  'varchar',
  'text',
  'boolean',
  'bool',
  'date',
  'datetime',
  'time',
  'object',
  'array',
  'enum',
]
const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const aggregateTypes = ['sum', 'count', 'avg', 'min', 'max', 'join']
const dependencyTypes = ['currentRow', 'selectedRows', 'allRows', 'pagedRows']
const sortDirections = ['asc', 'desc']
const treeModes = ['flat', 'nested']
const commitModes = ['immediate', 'staged']
const resourceTypes = [
  'database-table',
  'database-view',
  'third-party-api',
  'static-data',
  'dictionary',
  'logical-view',
]
const businessCategories = ['master', 'child', 'reference']

export function canUseStructuredPageDataEditor(rawText: string): boolean {
  if (rawText.trim() === '') return false
  try {
    canonicalizePageDataJson(rawText)
    return true
  } catch {
    return false
  }
}

type JsonSchemaNode = Record<string, unknown>

function withMeta<T extends JsonSchemaNode>(
  title: string,
  description: string,
  schema: T,
): T & { title: string; description: string } {
  return { title, description, ...schema }
}

export const PAGE_DATA_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SPARK 标准化页面数据',
  description: 'SPARK DataSet 的标准序列化结构。术语与 spark-data 运行时保持一致。',
  type: 'object',
  properties: {
    schemaVersion: withMeta('Schema 版本号', '当前 pagedata.json 使用的结构版本号。', { type: 'number' }),
    dataSetName: withMeta('DataSet 名称', '当前页面数据空间的名称。', { type: 'string' }),
    tables: withMeta('数据表集合', 'DataSet 中的全部数据表。', {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/tableMetadata' },
    }),
    tableRelations: withMeta('表关系集合', '描述表与表之间的父子关系。', {
      type: 'array',
      items: { $ref: '#/$defs/tableRelation' },
    }),
    viewDependencies: withMeta('视图依赖集合', '描述父表 default 视图状态变化如何驱动子表 default 视图联动。', {
      type: 'array',
      items: { $ref: '#/$defs/viewDependency' },
    }),
    version: withMeta('页面数据版本号', '页面数据内容本身的业务版本号，可选。', { type: 'number' }),
    pageId: withMeta('页面 ID', '当前页面配置的 pageId，可选。', { type: 'string' }),
  },
  required: ['tables'],
  additionalProperties: false,
  $defs: {
    jsonObject: withMeta('通用对象', '用于承载 headers、params、condition、crudConfig 等开放结构对象。', {
      type: 'object',
      additionalProperties: true,
    }),
    dataRow: withMeta('数据行', '表或视图中的单条行对象。键名应与列定义保持一致。', {
      type: 'object',
      additionalProperties: true,
    }),
    httpEndpoint: withMeta('HTTP 端点', '描述单个 CRUD 或树接口端点。', {
      type: 'object',
      properties: {
        url: withMeta('接口地址', '请求 URL。', { type: 'string' }),
        method: withMeta('HTTP 方法', '请求方法。', { type: 'string', enum: httpMethods }),
        headers: withMeta('请求头', '请求头键值对。', { type: 'object', additionalProperties: { type: 'string' } }),
        params: withMeta('查询参数模板', 'URL 查询参数模板。', { $ref: '#/$defs/jsonObject' }),
        pathParams: withMeta('路径参数名', '路径占位参数名数组。', { type: 'array', items: { type: 'string' } }),
        baseURL: withMeta('基础地址', '可选 API 基础地址。', { type: 'string' }),
      },
      required: ['url'],
      additionalProperties: false,
    }),
    crudApi: withMeta('CRUD API 配置', '描述每个操作对应哪个接口。', {
      type: 'object',
      properties: {
        create: { $ref: '#/$defs/httpEndpoint' },
        retrieve: { $ref: '#/$defs/httpEndpoint' },
        update: { $ref: '#/$defs/httpEndpoint' },
        delete: { $ref: '#/$defs/httpEndpoint' },
        list: { $ref: '#/$defs/httpEndpoint' },
        batch: { $ref: '#/$defs/jsonObject' },
        import: { $ref: '#/$defs/httpEndpoint' },
        export: { $ref: '#/$defs/httpEndpoint' },
        node: { $ref: '#/$defs/httpEndpoint' },
        children: { $ref: '#/$defs/httpEndpoint' },
        path: { $ref: '#/$defs/httpEndpoint' },
        subtree: { $ref: '#/$defs/httpEndpoint' },
        move: { $ref: '#/$defs/httpEndpoint' },
        search: { $ref: '#/$defs/httpEndpoint' },
        nested: { $ref: '#/$defs/httpEndpoint' },
        nestedSearch: { $ref: '#/$defs/httpEndpoint' },
      },
      additionalProperties: false,
    }),
    aggregateColumnConfig: withMeta('聚合列配置', '描述 aggregateResult / selectionAggregateResult 的聚合方式。', {
      type: 'object',
      properties: {
        type: withMeta('聚合类型', '聚合类型。', { type: 'string', enum: aggregateTypes }),
        field: withMeta('源字段名', '聚合来源字段名。', { type: 'string' }),
        label: withMeta('展示标题', '聚合结果的 UI 展示标题。', { type: 'string' }),
        separator: withMeta('拼接分隔符', 'join 聚合时使用的分隔符。', { type: 'string' }),
      },
      required: ['type'],
      additionalProperties: false,
    }),
    sortField: withMeta('排序字段', '描述单个排序字段与方向。', {
      type: 'object',
      properties: {
        field: withMeta('字段名', '参与排序的字段名。', { type: 'string' }),
        direction: withMeta('排序方向', '排序方向。', { type: 'string', enum: sortDirections }),
      },
      required: ['field'],
      additionalProperties: false,
    }),
    treeConfig: withMeta('树配置', '描述视图树形结构。', {
      type: 'object',
      properties: {
        idField: { type: 'string' },
        parentIdField: { type: 'string' },
        textField: { type: 'string' },
        depthLimit: { type: 'number' },
        lazy: { type: 'boolean' },
        treeMode: { type: 'string', enum: treeModes },
      },
      additionalProperties: false,
    }),
    dataColumn: withMeta('数据列定义', '描述数据结构与渲染元信息。', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: knownColumnTypes },
        label: { type: 'string' },
        allowDBNull: { type: 'boolean' },
        defaultValue: {},
        isPrimaryKey: { type: 'boolean' },
        autoIncrement: { type: 'boolean' },
        isComputed: { type: 'boolean' },
        required: { type: 'boolean' },
        minLength: { type: 'number' },
        maxLength: { type: 'number' },
        min: { type: 'number' },
        max: { type: 'number' },
        pattern: { type: 'string' },
        patternMessage: { type: 'string' },
        computeExpression: { type: 'string' },
      },
      required: ['name', 'type'],
      additionalProperties: false,
    }),
    viewMetadata: withMeta('视图元数据', '描述 DataView 的运行配置。', {
      type: 'object',
      properties: {
        tableName: { type: 'string' },
        viewId: { type: 'string' },
        rows: { type: 'array', items: { $ref: '#/$defs/dataRow' } },
        filterExpression: { $ref: '#/$defs/jsonObject' },
        sortExpression: { type: 'array', items: { $ref: '#/$defs/sortField' } },
        autoCurrentFirst: { type: 'boolean' },
        autoSelectFirst: { type: 'boolean' },
        page: { type: 'number' },
        pageSize: { type: 'number' },
        treeConfig: { $ref: '#/$defs/treeConfig' },
        valueField: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        labelField: { type: 'string' },
        selectionDelimiter: { type: 'string' },
        autoLoad: { type: 'boolean' },
        commitMode: { type: 'string', enum: commitModes },
        aggregates: { type: 'object', additionalProperties: { $ref: '#/$defs/aggregateColumnConfig' } },
      },
      additionalProperties: false,
    }),
    tableRelation: withMeta('表关系', '描述父表与子表之间的关联。', {
      type: 'object',
      properties: {
        relationName: { type: 'string' },
        parentTable: { type: 'string' },
        childTable: { type: 'string' },
        childField: { type: 'string' },
        parentField: { type: 'string' },
        condition: { $ref: '#/$defs/jsonObject' },
        cascadeUpdate: { type: 'boolean' },
        cascadeDelete: { type: 'boolean' },
      },
      required: ['parentTable', 'childTable'],
      additionalProperties: false,
    }),
    viewDependency: withMeta('视图依赖', '描述父表 default 视图状态变化如何驱动子表 default 视图联动。', {
      type: 'object',
      properties: {
        parentTable: { type: 'string' },
        childTable: { type: 'string' },
        dependencyType: { type: 'string', enum: dependencyTypes },
        autoLoad: { type: 'boolean' },
      },
      required: ['parentTable', 'childTable'],
      additionalProperties: false,
    }),
    tableMetadata: withMeta('数据表元数据', '描述一张表的列、资源语义、API 与视图配置。', {
      type: 'object',
      properties: {
        tableName: { type: 'string' },
        columns: { type: 'array', items: { $ref: '#/$defs/dataColumn' } },
        resourceType: { type: 'string', enum: resourceTypes },
        resourceId: { type: 'string' },
        businessCategory: { type: 'string', enum: businessCategories },
        api: { $ref: '#/$defs/crudApi' },
        crudConfig: { $ref: '#/$defs/jsonObject' },
        views: {
          type: 'object',
          properties: {
            default: { $ref: '#/$defs/viewMetadata' },
          },
          required: ['default'],
          additionalProperties: { $ref: '#/$defs/viewMetadata' },
        },
      },
      required: ['columns', 'views'],
      additionalProperties: false,
    }),
  },
}
