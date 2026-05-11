import {
  canonicalizePageDataJson,
  canonicalizePageDataValue,
} from '@spark-view/spark-ai/services/page-design'

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
  return {
    title,
    description,
    ...schema,
  }
}

export const PAGE_DATA_JSON_SCHEMA: Record<string, unknown> = {
  // vanilla-jsoneditor 3.x creates an Ajv draft-07 validator by default.
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SPARK 标准化页面数据',
  description: 'SPARK DataSet 的标准序列化结构。DevSystem 对象编辑器中的属性中文名与说明与 spark-data 运行时术语保持一致。',
  type: 'object',
  properties: {
    schemaVersion: withMeta('Schema 版本号', '当前 pagedata.json 使用的结构版本号。', { type: 'number' }),
    dataSetName: withMeta('DataSet 名称', '当前页面数据空间的名称，对应 DataSet.dataSetName。', { type: 'string' }),
    tables: withMeta('数据表集合', 'DataSet 中的全部数据表。对象键通常是 tableName，值是对应表的元数据配置。', {
      type: 'object',
      additionalProperties: { $ref: '#/$defs/tableMetadata' },
    }),
    tableRelations: withMeta('表关系集合', '描述表与表之间的父子关系。术语与 TableRelation 保持一致。', {
      type: 'array',
      items: { $ref: '#/$defs/tableRelation' },
    }),
    viewDependencies: withMeta('视图依赖集合', '描述父视图状态变化如何驱动子视图联动。术语与 ViewDependency 保持一致。', {
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
        method: withMeta('HTTP 方法', '请求方法，仅支持标准 HTTP 方法。', { type: 'string', enum: httpMethods }),
        headers: withMeta('请求头', '请求头键值对。', {
          type: 'object',
          additionalProperties: { type: 'string' },
        }),
        params: withMeta('查询参数模板', 'URL 查询参数模板。', { $ref: '#/$defs/jsonObject' }),
        pathParams: withMeta('路径参数名', '路径占位参数名数组，例如 ["id"]。', {
          type: 'array',
          items: { type: 'string' },
        }),
        baseURL: withMeta('基础地址', '可选 API 基础地址。', { type: 'string' }),
      },
      required: ['url'],
      additionalProperties: false,
    }),
    listEndpoint: withMeta('列表端点', '用于 list 接口，可额外声明分页参数名。', {
      type: 'object',
      properties: {
        url: withMeta('接口地址', '请求 URL。', { type: 'string' }),
        method: withMeta('HTTP 方法', '请求方法，仅支持标准 HTTP 方法。', { type: 'string', enum: httpMethods }),
        headers: withMeta('请求头', '请求头键值对。', {
          type: 'object',
          additionalProperties: { type: 'string' },
        }),
        params: withMeta('查询参数模板', 'URL 查询参数模板。', { $ref: '#/$defs/jsonObject' }),
        pathParams: withMeta('路径参数名', '路径占位参数名数组，例如 ["id"]。', {
          type: 'array',
          items: { type: 'string' },
        }),
        baseURL: withMeta('基础地址', '可选 API 基础地址。', { type: 'string' }),
        pagination: withMeta('分页参数映射', '列表接口的页码、每页大小、排序字段参数名。', {
          type: 'object',
          properties: {
            pageParam: withMeta('页码参数名', '分页页码对应的参数名。', { type: 'string' }),
            sizeParam: withMeta('每页大小参数名', '分页大小对应的参数名。', { type: 'string' }),
            sortParam: withMeta('排序参数名', '排序字段对应的参数名。', { type: 'string' }),
          },
          additionalProperties: false,
        }),
      },
      required: ['url'],
      additionalProperties: false,
    }),
    treeEndpoint: withMeta('树端点', '用于 children、subtree、nestedSearch 等树形接口。', {
      type: 'object',
      properties: {
        url: withMeta('接口地址', '请求 URL。', { type: 'string' }),
        method: withMeta('HTTP 方法', '请求方法，仅支持标准 HTTP 方法。', { type: 'string', enum: httpMethods }),
        headers: withMeta('请求头', '请求头键值对。', {
          type: 'object',
          additionalProperties: { type: 'string' },
        }),
        params: withMeta('查询参数模板', 'URL 查询参数模板。', { $ref: '#/$defs/jsonObject' }),
        pathParams: withMeta('路径参数名', '路径占位参数名数组，例如 ["id"]。', {
          type: 'array',
          items: { type: 'string' },
        }),
        baseURL: withMeta('基础地址', '可选 API 基础地址。', { type: 'string' }),
        limit: withMeta('最大返回节点数', '单次请求最多返回的节点数。', { type: 'number' }),
        depthLimit: withMeta('深度限制', '树查询的最大深度限制。', { type: 'number' }),
        includeTargetChildren: withMeta('包含目标节点子节点', '路径或子树查询时是否包含目标节点的子节点。', { type: 'boolean' }),
      },
      required: ['url'],
      additionalProperties: false,
    }),
    crudApi: withMeta('CRUD API 配置', '描述每个操作对应哪个接口。对象结构与 DataSetCrudTool 的 CrudApi 术语保持一致。', {
      type: 'object',
      properties: {
        create: withMeta('创建端点', 'create 操作对应的接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        retrieve: withMeta('单条查询端点', 'retrieve 操作对应的接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        update: withMeta('更新端点', 'update 操作对应的接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        delete: withMeta('删除端点', 'delete 操作对应的接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        list: withMeta('列表端点', 'list 操作对应的接口端点。', { $ref: '#/$defs/listEndpoint' }),
        batch: withMeta('批量操作端点', '批量 create / update / delete 对应的接口端点。', {
          type: 'object',
          properties: {
            create: withMeta('批量创建端点', '批量创建接口端点。', { $ref: '#/$defs/httpEndpoint' }),
            update: withMeta('批量更新端点', '批量更新接口端点。', { $ref: '#/$defs/httpEndpoint' }),
            delete: withMeta('批量删除端点', '批量删除接口端点。', { $ref: '#/$defs/httpEndpoint' }),
          },
          additionalProperties: false,
        }),
        import: withMeta('导入端点', 'import 操作对应的接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        export: withMeta('导出端点', 'export 操作对应的接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        node: withMeta('节点端点', '树节点单条查询接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        children: withMeta('子节点端点', 'children 操作对应的树接口端点。', { $ref: '#/$defs/treeEndpoint' }),
        path: withMeta('路径端点', 'path 操作对应的接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        subtree: withMeta('子树端点', 'subtree 操作对应的树接口端点。', { $ref: '#/$defs/treeEndpoint' }),
        move: withMeta('移动端点', 'move 操作对应的接口端点。', { $ref: '#/$defs/httpEndpoint' }),
        search: withMeta('搜索端点', 'search 操作对应的树接口端点。', { $ref: '#/$defs/treeEndpoint' }),
        nested: withMeta('嵌套端点', 'nested 操作对应的树接口端点。', { $ref: '#/$defs/treeEndpoint' }),
        nestedSearch: withMeta('嵌套搜索端点', 'nestedSearch 操作对应的树接口端点。', { $ref: '#/$defs/treeEndpoint' }),
      },
      additionalProperties: false,
    }),
    aggregateColumnConfig: withMeta('聚合列配置', '描述 aggregateResult / selectionAggregateResult 的聚合方式。对应 AggregateColumnConfig。', {
      type: 'object',
      properties: {
        type: withMeta('聚合类型', '聚合类型，仅支持 sum / count / avg / min / max / join。', { type: 'string', enum: aggregateTypes }),
        field: withMeta('源字段名', '聚合来源字段名；未设置时默认使用当前聚合输出键。', { type: 'string' }),
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
        direction: withMeta('排序方向', '排序方向，仅支持 asc / desc。', { type: 'string', enum: sortDirections }),
      },
      required: ['field'],
      additionalProperties: false,
    }),
    treeConfig: withMeta('树配置', '描述视图树形结构。对应 dataview.setTreeConfig 的 TreeConfig。', {
      type: 'object',
      properties: {
        idField: withMeta('节点 ID 字段', '树节点唯一标识字段名。', { type: 'string' }),
        parentIdField: withMeta('父节点 ID 字段', '树节点父级标识字段名。', { type: 'string' }),
        textField: withMeta('节点文本字段', '树节点显示文本字段名。', { type: 'string' }),
        depthLimit: withMeta('深度限制', '树结构最大深度限制。', { type: 'number' }),
        lazy: withMeta('是否懒加载', '是否按需加载树节点。', { type: 'boolean' }),
        treeMode: withMeta('树模式', '树数据模式，仅支持 flat / nested。', { type: 'string', enum: treeModes }),
      },
      additionalProperties: false,
    }),
    dataColumn: withMeta('数据列定义', '描述数据结构与渲染元信息。对应 spark-data 的 DataColumn 术语。', {
      type: 'object',
      properties: {
        name: withMeta('列名', '列的唯一名称。', { type: 'string' }),
        type: withMeta('列类型', '列值类型，常用 string / number / boolean / date / datetime。', { type: 'string', enum: knownColumnTypes }),
        label: withMeta('列标题', 'UI 表头 / 表单标签 / 详情标题。未设置时通常回退到 name。', { type: 'string' }),
        allowDBNull: withMeta('允许空值', '是否允许该列为 null。', { type: 'boolean' }),
        defaultValue: withMeta('默认值', '列的默认值。', {}),
        isPrimaryKey: withMeta('是否主键', '是否为主键列。', { type: 'boolean' }),
        autoIncrement: withMeta('是否自增', '是否为自增列。', { type: 'boolean' }),
        isComputed: withMeta('是否框架计算列', '是否为框架自动维护的计算列。', { type: 'boolean' }),
        required: withMeta('是否必填', 'UI 层是否按必填字段处理。', { type: 'boolean' }),
        minLength: withMeta('最小长度', '字符串最小长度限制。', { type: 'number' }),
        maxLength: withMeta('最大长度', '字符串最大长度限制。', { type: 'number' }),
        min: withMeta('最小值', '数值最小值限制。', { type: 'number' }),
        max: withMeta('最大值', '数值最大值限制。', { type: 'number' }),
        pattern: withMeta('正则校验表达式', '字符串校验使用的正则表达式。', { type: 'string' }),
        patternMessage: withMeta('正则失败提示', '正则校验失败时显示的提示语。', { type: 'string' }),
        computeExpression: withMeta('计算列表达式', '计算列的表达式字符串，可引用当前行字段或 ctx。', { type: 'string' }),
      },
      required: ['name', 'type'],
      additionalProperties: false,
    }),
    viewMetadata: withMeta('视图元数据', '描述 DataView 的运行配置。对应 DataView 配置。', {
      type: 'object',
      properties: {
        tableName: withMeta('所属表名', '视图所属的数据表名。', { type: 'string' }),
        viewId: withMeta('视图 ID', '视图唯一标识，默认视图通常是 default。', { type: 'string' }),
        rows: withMeta('内联行数据', '仅 resourceType = static-data 时适合直接声明；远程列表不要把接口结果固化在这里。', {
          type: 'array',
          items: { $ref: '#/$defs/dataRow' },
        }),
        filterExpression: withMeta('过滤表达式', '视图过滤表达式对象。', { $ref: '#/$defs/jsonObject' }),
        sortExpression: withMeta('排序表达式', '视图排序字段数组。', {
          type: 'array',
          items: { $ref: '#/$defs/sortField' },
        }),
        autoCurrentFirst: withMeta('自动聚焦首行', '加载完成后是否自动设置 currentRow 为第一行。', { type: 'boolean' }),
        autoSelectFirst: withMeta('自动选中首行', '加载完成后是否自动把第一行加入 selectedRows。', { type: 'boolean' }),
        page: withMeta('当前页码', '分页视图当前页码。', { type: 'number' }),
        pageSize: withMeta('每页行数', '分页视图每页显示的行数。', { type: 'number' }),
        treeConfig: withMeta('树配置', '当前视图的树形配置。', { $ref: '#/$defs/treeConfig' }),
        valueField: withMeta('值字段', '选项视图用于序列化值的字段，可为单字段或多字段数组。', {
          oneOf: [
            { type: 'string' },
            {
              type: 'array',
              items: { type: 'string' },
            },
          ],
        }),
        labelField: withMeta('标签字段', '选项视图用于显示文本的字段。', { type: 'string' }),
        selectionDelimiter: withMeta('多选分隔符', '多选值序列化分隔符；空字符串通常表示单选。', { type: 'string' }),
        autoLoad: withMeta('是否自动加载', 'DataSet 初始化后是否自动请求该视图数据。', { type: 'boolean' }),
        commitMode: withMeta('提交模式', '视图提交模式，仅支持 immediate / staged。', { type: 'string', enum: commitModes }),
        aggregates: withMeta('聚合列集合', '视图级聚合列配置集合，对应 dataview.setAggregates。', {
          type: 'object',
          additionalProperties: { $ref: '#/$defs/aggregateColumnConfig' },
        }),
      },
      additionalProperties: false,
    }),
    tableRelation: withMeta('表关系', '描述父表与子表之间的关联。', {
      type: 'object',
      properties: {
        relationName: withMeta('关系名', '可选的关系名称。', { type: 'string' }),
        parentTable: withMeta('父表', '关系中的父表名。', { type: 'string' }),
        childTable: withMeta('子表', '关系中的子表名。', { type: 'string' }),
        childField: withMeta('子表关联字段', '子表中用于关联父表的字段名。', { type: 'string' }),
        parentField: withMeta('父表关联字段', '父表中被子表引用的字段名。', { type: 'string' }),
        condition: withMeta('附加条件', '关系附加条件对象。', { $ref: '#/$defs/jsonObject' }),
        cascadeUpdate: withMeta('是否级联更新', '父表更新时是否级联到子表。', { type: 'boolean' }),
        cascadeDelete: withMeta('是否级联删除', '父表删除时是否级联到子表。', { type: 'boolean' }),
      },
      required: ['parentTable', 'childTable'],
      additionalProperties: false,
    }),
    viewDependency: withMeta('视图依赖', '描述父视图状态变化如何驱动子视图联动。', {
      type: 'object',
      properties: {
        parentTable: withMeta('父表', '依赖关系中的父表名。', { type: 'string' }),
        childTable: withMeta('子表', '依赖关系中的子表名。', { type: 'string' }),
        dependencyType: withMeta('依赖类型', '父视图触发子视图联动的状态类型，默认通常为 currentRow。', { type: 'string', enum: dependencyTypes }),
        autoLoad: withMeta('是否自动加载', '父视图状态变化时是否自动加载子视图。', { type: 'boolean' }),
      },
      required: ['parentTable', 'childTable'],
      additionalProperties: false,
    }),
    tableMetadata: withMeta('数据表元数据', '描述一张表的列、资源语义、API 与视图配置。', {
      type: 'object',
      properties: {
        tableName: withMeta('表名', '数据表名称。未设置时通常由外层对象键推导。', { type: 'string' }),
        columns: withMeta('列定义集合', '当前表的全部列定义。', {
          type: 'array',
          items: { $ref: '#/$defs/dataColumn' },
        }),
        resourceType: withMeta('资源类型', '描述该表背后对应的资源来源或承载形态。static-data 是当前约定下唯一允许直接声明静态 rows 的资源类型。', { type: 'string', enum: resourceTypes }),
        resourceId: withMeta('资源 ID', '对应外部资源系统中的稳定标识，例如库表名、字典编码或第三方资源编码。', { type: 'string' }),
        businessCategory: withMeta('业务分类', '描述该表在当前业务模型中的角色，如主表 / 从表 / 引用表。', { type: 'string', enum: businessCategories }),
        api: withMeta('API 配置', '表级 API 配置，必须使用 CrudApi 对象结构。', { $ref: '#/$defs/crudApi' }),
        crudConfig: withMeta('CRUD 运行配置', 'CRUD 运行策略配置对象。', { $ref: '#/$defs/jsonObject' }),
        views: withMeta('视图集合', '当前表下的全部视图配置。default 视图是必需项。', {
          type: 'object',
          properties: {
            default: withMeta('默认视图', '表的默认视图配置。', { $ref: '#/$defs/viewMetadata' }),
          },
          required: ['default'],
          additionalProperties: { $ref: '#/$defs/viewMetadata' },
        }),
      },
      required: ['columns', 'views'],
      additionalProperties: false,
    }),
  },
}
