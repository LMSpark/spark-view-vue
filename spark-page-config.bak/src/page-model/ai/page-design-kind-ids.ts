/**
 * PageDesign AI 子系统的 kind ID 常量注册。
 *
 * ## 层次关系
 * ```
 * pageDesign (root)  ← 根 kind，负责实例发现与子模块路由
*   ├── lifecycle      流程控制：bootstrap / describeProgress / describeDesignFlow
 *   ├── standard-page  标准件：管理台等可确定性装配的页面成品
*   ├── text-model     文本模型：script.js / style.css 全量读写
 *   ├── payload-catalog  组件知识库：queryPayloads / guidePayload
 *   ├── node-tree      结构编辑：rule.json 的 SparkNodeTree CRUD
 *   └── dataset        数据编辑：pagedata.json 的 DataSetCrudTool CRUD
 * ```
 *
 * ## 工位关系
 * dataset / node-tree / text-model 是 PageNode 业务生产线里的能力工位，
 * 不是互相隔离的 Agent 阶段。LLM 可依据用户需求、100 步检查视图和工具结果
 * 在工位之间往返推理，把已确认事实通过函数调用沉淀到 PageNode。
 *
 * 推荐先建立业务数据事实，再装配 UI 结构和文本模型；但顺序由阶段检测、
 * 标准件结果和业务门禁共同控制，而不是由 spark-ai 内核硬编码。
 */

export const PAGE_DESIGN_ROOT_KIND = 'pageDesign'
export const PAGE_DESIGN_LIFECYCLE_KIND = 'lifecycle'
export const PAGE_DESIGN_STANDARD_PAGE_KIND = 'standard-page'
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
    kind: PAGE_DESIGN_STANDARD_PAGE_KIND,
    label: '页面标准件',
    summary: '选择管理工作台等工业标准件，一次确定性装配四文件。',
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
