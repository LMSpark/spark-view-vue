export const PAGE_DESIGN_LIFECYCLE_MODULE_PROMPT = 'lifecycle 模块只负责读取当前编辑运行状态、绑定宿主提供的 live binding，并验证 nodeTree、dataset、script、style 能力齐全；bootstrap 不复制第二份页面事实，也不修改页面内容。'

export const PAGE_DESIGN_TEXT_MODEL_MODULE_PROMPT = 'textModel 模块只读写 live script.js/style.css 文本模型；写入必须提交完整文件内容，script.js 遵守 sandbox API 边界，禁止 ESM import、window 全局和不可用 $page 伪 API。'

export const PAGE_DESIGN_NODE_TREE_MODULE_PROMPT = 'nodeTree 模块只操作当前 live SparkNodeTree/rule.json 结构；构造或替换组件前必须先用 queryPayloads 与 guidePayload 查询合法 SparkNode schema，并使用真实 componentId/parentId。'

export const PAGE_DESIGN_DATASET_MODULE_PROMPT = 'dataset 模块只操作当前 DataSetCrudTool/pagedata.json 数据空间；DataSet 是内存数据与视图配置，不是数据库，禁止套用 FK、索引、约束等 RDBMS 假设。'

export const PAGE_DESIGN_KNOWLEDGE_MODULE_PROMPT = 'knowledge 模块只暴露 core 统一知识查询：queryFunctions/queryModules/queryPayloads/guideFunction/guidePayload；新增或替换 SparkNode 前先查询组件参数，再按 guidePayload 返回的 paramsSchema 构造 node。'
