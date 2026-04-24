// rule.json JSON Schema — 描述 SparkNode[] 配置数组的结构

import { DEV_TYPES } from '../ai-bridge'

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
    sparkNode: withMeta('组件节点 Component Node', '严格对齐 h(type, props, children) 三字段。id / dataKey / field / on 等业务属性均在 props 内声明。', {
      type: 'object',
      properties: {
        type: withMeta('组件类型 Component Type', '组件注册名（kebab-case），如 r-table / el-button / div。', { type: 'string', enum: DEV_TYPES }),
        props: withMeta('组件属性 Props', '传给组件的全部属性。id / dataKey / field / label / on / visible / disabled 均在此声明。', {
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
        // ── 常用根级快捷键（绑定阶段收入 props）──
        dataKey: withMeta('数据绑定键 Data Key', 'DataKey 格式：table@field 或 table@viewId@field。自解析容器（r-table / r-form / r-detail / r-tree）自行解析；非自解析组件由 bindRules 在规则绑定阶段解析。', { type: 'string' }),
        field: withMeta('字段名 Field', '字段组件绑定的列名，如 name / price / status。', { type: 'string' }),
        label: withMeta('标签 Label', '字段组件或列的显示标题。', { type: 'string' }),
        on: withMeta('事件绑定 Events', '事件名到 script.js 函数名的映射，如 { "click": "handleClick" }。', {
          type: 'object',
          additionalProperties: { type: 'string' },
        }),
        visible: withMeta('是否可见 Visible', '控制组件可见性。false 时组件不渲染。', { type: 'boolean' }),
        disabled: withMeta('是否禁用 Disabled', '控制组件禁用状态。', { type: 'boolean' }),
        style: withMeta('内联样式 Style', 'CSS 样式对象（camelCase），如 { "display": "flex", "gap": "8px" }。', {
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
