export const PAGE_DESIGN_ROOT_KIND = 'pageDesign'

export const PAGE_DESIGN_CHILD_MODULES = [
  {
    kind: 'lifecycle',
    label: '页面设计生命周期',
    summary: '校验 live binding 是否齐全，进入 editing phase。',
  },
  {
    kind: 'text-model',
    label: '页面文本模型',
    summary: '全量读写 script.js / style.css。',
  },
  {
    kind: 'payload-catalog',
    label: '组件荷载知识目录',
    summary: '查询组件 payload、props 参数指南和可用组件目录。',
  },
  {
    kind: 'node-tree',
    label: '页面节点树',
    summary: '通过 SparkNodeTree 修改 rule.json。',
  },
  {
    kind: 'dataset',
    label: '页面数据集',
    summary: '通过 DataSetCrudTool 修改 pagedata.json。',
  },
] as const
