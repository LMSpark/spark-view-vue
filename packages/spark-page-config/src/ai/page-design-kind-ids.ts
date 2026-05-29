/**
 * PageDesign AI 子系统的 kind ID 常量注册。
 *
 * ## 层次关系
 * ```
 * pageDesign (root)  ← 根 kind，负责实例发现与子模块路由
 *   ├── lifecycle      流程控制：bootstrap / describeProgress / describeDesignFlow
 *   ├── text-model     文本模型：script.js / style.css 全量读写
 *   ├── payload-catalog  组件知识库：queryPayloads / guidePayload
 *   ├── node-tree      结构编辑：rule.json 的 SparkNodeTree CRUD
 *   └── dataset        数据编辑：pagedata.json 的 DataSetCrudTool CRUD
 * ```
 *
 * ## 写入顺序约束
 * LLM 必须按 dataset → node-tree → text-model 的顺序编辑四文件：
 * 先建数据表，再搭页面结构，最后补脚本和样式。
 * node-tree 的写入校验会强制"数据优先"规则。
 */

export const PAGE_DESIGN_ROOT_KIND = 'pageDesign'
export const PAGE_DESIGN_LIFECYCLE_KIND = 'lifecycle'
export const PAGE_DESIGN_TEXT_MODEL_KIND = 'text-model'
export const PAGE_DESIGN_PAYLOAD_CATALOG_KIND = 'payload-catalog'
export const PAGE_DESIGN_NODE_TREE_KIND = 'node-tree'
export const PAGE_DESIGN_DATASET_KIND = 'dataset'

export const PAGE_DESIGN_COMPONENT_PAYLOAD_REF = 'spark.component'

export const PAGE_DESIGN_CHILD_MODULES = [
  {
    kind: PAGE_DESIGN_LIFECYCLE_KIND,
    label: '页面设计生命周期',
    summary: '校验 live binding 是否齐全，进入 editing phase，并提供 100 步流程事实。',
  },
  {
    kind: PAGE_DESIGN_TEXT_MODEL_KIND,
    label: '页面文本模型',
    summary: '全量读写 script.js / style.css。',
  },
  {
    kind: PAGE_DESIGN_PAYLOAD_CATALOG_KIND,
    label: '组件荷载知识目录',
    summary: '查询组件 payload、props 参数指南和可用组件目录。',
  },
  {
    kind: PAGE_DESIGN_NODE_TREE_KIND,
    label: '页面节点树',
    summary: '通过 SparkNodeTree 修改 rule.json。',
  },
  {
    kind: PAGE_DESIGN_DATASET_KIND,
    label: '页面数据集',
    summary: '通过 DataSetCrudTool 修改 pagedata.json。',
  },
] as const
