import {
  EMPTY_RULE_EDITOR_COMPONENT_METADATA,
  type RuleEditorComponentMetadata,
} from './rule-editor-metadata'

type JsonSchemaNode = Record<string, unknown>

function withMeta<T extends JsonSchemaNode>(
  title: string,
  description: string,
  schema: T,
): T & { title: string; description: string } {
  return { title, description, ...schema }
}

export function createRuleJsonSchema(
  metadata: RuleEditorComponentMetadata = EMPTY_RULE_EDITOR_COMPONENT_METADATA,
): Record<string, unknown> {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'SPARK 页面规则配置',
    description: 'SparkNode 数组，描述页面组件树。每个节点对齐 Vue h(type, props, children) 三段式。',
    type: 'array',
    items: { $ref: '#/$defs/sparkNode' },
    $defs: {
      sparkNode: withMeta('组件节点 Component Node', '严格对齐 SparkNode 结构：type / id / props / children。id 是节点顶层稳定标识，禁止写入 props.id。', {
        type: 'object',
        properties: {
          type: withMeta('组件类型 Component Type', '组件注册名（kebab-case），如 r-table / el-button / div。', { type: 'string', enum: metadata.types }),
          id: withMeta('节点标识 Component ID', 'SparkNode 顶层稳定 id，用于脚本寻址和渲染 key。不要放到 props.id。', { type: 'string' }),
          props: withMeta('组件属性 Props', '传给组件的业务属性。dataViewKey / dataMember / dataField / contextDataMember / contextDataField / field / label / on / visible / disabled 等在此声明；id 必须写在节点顶层。', {
            type: 'object',
            additionalProperties: true,
          }),
          children: withMeta('子节点 Children', '子组件配置数组（递归 SparkNode），也可包含字符串/数字文本子节点。', {
            type: 'array',
            items: {
              oneOf: [
                { $ref: '#/$defs/sparkNode' },
                { type: 'string', title: '文本子节点 Text Node', description: '纯文本内容。' },
                { type: 'number', title: '数字子节点 Number Node', description: '数字文本内容。' },
              ],
            },
          }),
          dataViewKey: withMeta('DataView 定位键 DataView Key', 'DataViewKey 格式：table@viewId 或 #scope@table@viewId。', { type: 'string' }),
          dataMember: withMeta('DataView 成员 Data Member', 'DataView 成员枚举，如 rows、currentRow、aggregateResult。', {
            type: 'string',
            enum: ['rows', 'columns', 'currentRow', 'selectedRows', 'aggregateResult', 'selectionAggregateResult', 'total', 'page', 'pageSize', 'requestState', 'mutating', 'loadingError', 'mutatingError'],
          }),
          dataField: withMeta('DataView 成员字段 Data Field', 'DataView 成员内部业务字段或点路径，如 name、totalAmount。', { type: 'string' }),
          contextDataMember: withMeta('上下文 DataView 成员 Context Data Member', 'r-form / r-detail 的上下文成员，默认通常为 currentRow。', { type: 'string' }),
          contextDataField: withMeta('上下文字段 Context Data Field', '上下文成员内部业务字段或点路径。', { type: 'string' }),
          field: withMeta('字段名 Field', '字段组件绑定的列名。', { type: 'string' }),
          label: withMeta('标签 Label', '字段组件或列的显示标题。', { type: 'string' }),
          on: withMeta('事件绑定 Events', '事件名到 script.js 函数名的映射，如 { "click": "handleClick" }。', {
            type: 'object',
            additionalProperties: { type: 'string' },
          }),
          visible: withMeta('是否可见 Visible', '控制组件可见性。false 时组件不渲染。', { type: 'boolean' }),
          disabled: withMeta('是否禁用 Disabled', '控制组件禁用状态。', { type: 'boolean' }),
          style: withMeta('内联样式 Style', 'CSS 样式对象（camelCase）。', {
            type: 'object',
            additionalProperties: true,
          }),
          class: withMeta('CSS 类名 Class', 'CSS 类名字符串。', { type: 'string' }),
          name: withMeta('元素名称 Name', '表单元素命名，用于 DOM 查询。', { type: 'string' }),
        },
        required: ['type'],
        additionalProperties: true,
      }),
    },
  }
}
