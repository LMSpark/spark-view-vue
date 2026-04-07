// rule.json JSON Schema — 描述 SparkNode[] 配置数组的结构

import { COMPONENT_TYPES } from './_generated-catalog'

type JsonSchemaNode = Record<string, unknown>

function withMeta<T extends JsonSchemaNode>(
  title: string,
  description: string,
  schema: T,
): T & { title: string; description: string } {
  return { title, description, ...schema }
}

export const RULE_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SPARK 页面规则配置',
  description: 'SparkNode 数组，描述页面组件树。每个节点对齐 Vue h(type, props, children) 三段式。',
  type: 'array',
  items: { $ref: '#/$defs/sparkNode' },
  $defs: {
    sparkNode: withMeta('组件节点', '对齐 h(type, props, children) 的组件配置节点。根级的 dataKey / field / on / style / class 等均会在绑定阶段收入 props。', {
      type: 'object',
      properties: {
        type: withMeta('组件类型', '组件注册名（kebab-case），如 r-table / el-button / div。', { type: 'string', enum: COMPONENT_TYPES }),
        id: withMeta('节点 ID', '节点唯一标识，用于渲染 key / 脚本中 $query("#id") 引用。', { type: 'string' }),
        props: withMeta('组件属性', '传给组件的全部属性。dataKey / field / label / on / visible / disabled 写在根级或 props 内均可。', {
          type: 'object',
          additionalProperties: true,
        }),
        children: withMeta('子节点', '子组件配置数组（递归 SparkNode），也可包含字符串/数字文本子节点。', {
          type: 'array',
          items: {
            oneOf: [
              { $ref: '#/$defs/sparkNode' },
              { type: 'string', title: '文本子节点', description: '纯文本内容。' },
              { type: 'number', title: '数字子节点', description: '数字文本内容。' },
            ],
          },
        }),
        // ── 常用根级快捷键（绑定阶段收入 props）──
        dataKey: withMeta('数据绑定键', 'DataKey 格式：table@field 或 table@viewId@field。自解析容器（r-table / r-form / r-detail / r-tree）自行解析；非自解析组件由 bindRules 在规则绑定阶段解析。', { type: 'string' }),
        field: withMeta('字段名', '字段组件绑定的列名，如 name / price / status。', { type: 'string' }),
        label: withMeta('标签', '字段组件或列的显示标题。', { type: 'string' }),
        on: withMeta('事件绑定', '事件名到 script.js 函数名的映射，如 { "click": "handleClick" }。', {
          type: 'object',
          additionalProperties: { type: 'string' },
        }),
        visible: withMeta('是否可见', '控制组件可见性。false 时组件不渲染。', { type: 'boolean' }),
        disabled: withMeta('是否禁用', '控制组件禁用状态。', { type: 'boolean' }),
        style: withMeta('内联样式', 'CSS 样式对象（camelCase），如 { "display": "flex", "gap": "8px" }。', {
          type: 'object',
          additionalProperties: true,
        }),
        class: withMeta('CSS 类名', 'CSS 类名字符串。', { type: 'string' }),
        name: withMeta('元素名称', '表单元素命名，用于 DOM 查询。', { type: 'string' }),
      },
      required: ['type'],
      additionalProperties: true,
    }),
  },
}
