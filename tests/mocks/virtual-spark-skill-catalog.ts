export interface PropMeta {
  name: string
  type: string
  required?: boolean
  default?: string
  description?: string
}

export interface SkillMeta {
  type: string
  description?: string
  props?: PropMeta[]
  provides: string[]
  consumes: string[]
  inputSchema?: string
  example?: string
}

export const skillCatalog: SkillMeta[] = [
  {
    type: 'r-table',
    description: '表格容器',
    props: [
      { name: 'dataKey', type: 'string', required: false, description: '数据绑定键' },
      { name: 'stripe', type: 'boolean', required: false, description: '斑马纹' },
    ],
    provides: ['DATA_SOURCE'],
    consumes: ['PAGE_DATASET'],
  },
  {
    type: 'r-text',
    description: '文本字段',
    props: [
      { name: 'field', type: 'string', required: false, description: '字段名' },
      { name: 'label', type: 'string', required: false, description: '标签' },
    ],
    provides: [],
    consumes: [],
  },
]

export default skillCatalog
