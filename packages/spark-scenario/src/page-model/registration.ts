import type {
  AiScenarioCapability,
  AiScenarioCompletionContract,
  AiScenarioFlowContract,
  AiScenarioPayloadContract,
  AiScenarioPayloadSlotSource,
  AiScenarioPromptPolicy,
  AiScenarioRecoveryHint,
} from '../contracts/scenario-types'
import type { JsonSchemaProperty } from '../contracts/json-schema'
import { createDatasetToolFamily } from './dataset-tool'
import { createEditToolFamily } from './edit-tool'
import { createSparkNodeTreeToolFamily } from './node-tree-tool'
import { createTextModelToolFamily } from './text-model-tool'
import type { PageModelToolFamily } from './tool-contracts'

export const PAGE_MODEL_EDIT_SCENARIO_ID = 'page-model.edit'

export type PageModelRegistrationLevel = 'scenario' | 'flow' | 'payload' | 'tool'

export type PageModelPayloadRegistrationSource =
  | 'context'
  | 'session'
  | 'component-catalog'
  | 'page-model-host'
  | 'function-call'

export interface PageModelScenarioRegistration {
  id: typeof PAGE_MODEL_EDIT_SCENARIO_ID
  title: string
  description: string
  intents: readonly string[]
  promptPolicy: AiScenarioPromptPolicy
}

export interface PageModelPayloadRegistration {
  id: string
  key: string
  title: string
  description: string
  source: PageModelPayloadRegistrationSource
  schema: JsonSchemaProperty
  required?: boolean
  relatedTools?: readonly string[]
  rules?: readonly string[]
  examples?: readonly unknown[]
}

export interface PageModelKnowledgeRegistration {
  version: 'page-model-registration-v1'
  levels: readonly PageModelRegistrationLevel[]
  scenario: PageModelScenarioRegistration
  flow: AiScenarioFlowContract
  completion: AiScenarioCompletionContract
  recovery: readonly AiScenarioRecoveryHint[]
  payloads: readonly PageModelPayloadRegistration[]
  toolFamilies: readonly PageModelToolFamily[]
}

const TEXT_LIST_SCHEMA: JsonSchemaProperty = {
  type: 'array',
  description: '字符串列表荷载。',
  items: { type: 'string' },
}

const HOST_KEY_SCHEMA: JsonSchemaProperty = {
  type: 'object',
  description: 'PageModelHostKey 荷载，用于定位 tenant/project/page/session 维度下的同一个页面模型 host。',
  properties: {
    tenantId: { type: 'string', description: '租户 ID。' },
    projectId: { type: 'string', description: '项目 ID。' },
    pageId: { type: 'string', description: '页面 ID。' },
    sessionId: { type: 'string', description: 'AI 会话 ID；同页多会话必须隔离。' },
  },
  required: ['tenantId', 'projectId', 'pageId', 'sessionId'],
}

const REQUIREMENTS_SCHEMA: JsonSchemaProperty = {
  type: 'object',
  description: '本轮具体业务需求和限制荷载，由 edit.confirmRequirements 固化到 host/session。',
  properties: {
    summary: { type: 'string', description: '已确认的业务目标摘要。' },
    constraints: TEXT_LIST_SCHEMA,
    assumptions: TEXT_LIST_SCHEMA,
  },
  required: ['summary'],
}

const COMPONENT_PROPS_SCHEMA: JsonSchemaProperty = {
  type: 'object',
  description: '组件 Vue props 动态荷载。具体属性必须来自 component catalog / catalog.guide，不允许凭经验猜测。',
}

const SPARK_NODE_SCHEMA: JsonSchemaProperty = {
  type: 'object',
  description: 'SparkNode 荷载；props 字段承载组件 Vue props，必须按组件注册规格构造。',
  properties: {
    type: { type: 'string', description: '组件注册 type，如 r-table、r-card、el-button。' },
    id: { type: ['string', 'null'], description: '节点实例 ID；可由场景按需要生成或复用。' },
    props: COMPONENT_PROPS_SCHEMA,
    children: {
      type: 'array',
      description: '子节点荷载，仍为 SparkNode。',
      items: { type: 'object', description: 'SparkNode child payload。' },
    },
  },
  required: ['type'],
}

const DATASET_TABLE_SCHEMA: JsonSchemaProperty = {
  type: 'object',
  description: 'DataSet/DataTable 荷载，用于描述 pagedata.json 中的表、列、视图等结构。',
  properties: {
    tableName: { type: 'string', description: '表名。' },
    columns: {
      type: 'array',
      description: '列定义荷载。',
      items: { type: 'object', description: '列配置对象。' },
    },
  },
  required: ['tableName'],
}

const TEXT_CONTENT_SCHEMA: JsonSchemaProperty = {
  type: 'object',
  description: 'script.js / style.css 文本荷载，按整文件内容读写。',
  properties: {
    content: { type: 'string', description: '完整文件内容。' },
  },
  required: ['content'],
}

function payloadSlotSource(source: PageModelPayloadRegistrationSource): AiScenarioPayloadSlotSource {
  if (source === 'context') return 'context'
  if (source === 'function-call' || source === 'component-catalog') return 'tool'
  return 'system'
}

function createPageModelPayloadRegistrations(): readonly PageModelPayloadRegistration[] {
  return [
    {
      id: 'pageModel.payload.hostKey',
      key: 'hostKey',
      title: 'PageModelHostKey',
      description: '定位页面模型 host 的租户、项目、页面、会话荷载；通常来自上下文，也允许函数参数显式覆盖。',
      source: 'context',
      schema: HOST_KEY_SCHEMA,
      required: true,
      relatedTools: ['edit.open'],
    },
    {
      id: 'pageModel.payload.requirements',
      key: 'requirements',
      title: '具体业务需求和限制',
      description: '场景级之后的本轮业务需求、限制和假设荷载，由 edit.confirmRequirements 注册到当前会话。',
      source: 'session',
      schema: REQUIREMENTS_SCHEMA,
      required: true,
      relatedTools: ['edit.ask', 'edit.confirmRequirements', 'edit.inspect', 'edit.validate'],
    },
    {
      id: 'pageModel.payload.sparkNode',
      key: 'sparkNode',
      title: 'SparkNode 节点荷载',
      description: 'rule.json 节点树荷载；节点 type 是组件注册键，props 是该组件的 Vue props 荷载。',
      source: 'function-call',
      schema: SPARK_NODE_SCHEMA,
      relatedTools: ['sparkNodeTree.addNode', 'sparkNodeTree.setProps', 'sparkNodeTree.getNode'],
      rules: ['构造 SparkNode 前必须先通过组件目录确认 type，再读取该 type 的 props 规格。'],
    },
    {
      id: 'pageModel.payload.componentProps',
      key: 'componentProps',
      title: 'Vue 组件属性荷载',
      description: '组件 Vue props 是数量庞大的动态荷载；注册层只声明来源和规则，具体字段必须从 component catalog / catalog.guide 获取。',
      source: 'component-catalog',
      schema: COMPONENT_PROPS_SCHEMA,
      relatedTools: ['sparkNodeTree.addNode', 'sparkNodeTree.setProps'],
      rules: ['禁止不看组件 props schema 直接拼 props。', 'props 字段不是任意 JSON，它必须匹配组件注册规格。'],
    },
    {
      id: 'pageModel.payload.datasetTable',
      key: 'datasetTable',
      title: 'DataSet 表结构荷载',
      description: 'pagedata.json 的表、列、视图等结构荷载，由 datasetTool.* 函数消费。',
      source: 'function-call',
      schema: DATASET_TABLE_SCHEMA,
      relatedTools: ['datasetTool.createTable', 'datasetTool.listTables', 'datasetTool.export'],
    },
    {
      id: 'pageModel.payload.textContent',
      key: 'textContent',
      title: '文本文件内容荷载',
      description: 'script.js / style.css 的整文件文本荷载。',
      source: 'function-call',
      schema: TEXT_CONTENT_SCHEMA,
      relatedTools: ['textModel.writeScript', 'textModel.writeStyle'],
    },
  ]
}

export function createPageModelRegistrationKnowledge(): PageModelKnowledgeRegistration {
  return {
    version: 'page-model-registration-v1',
    levels: ['scenario', 'flow', 'payload', 'tool'],
    scenario: {
      id: PAGE_MODEL_EDIT_SCENARIO_ID,
      title: '页面模型 4 文件编辑',
      description: '通过注册制 FC 编辑 rule.json、pagedata.json、script.js、style.css。',
      intents: ['页面编辑', '4 文件编辑', 'page model edit'],
      promptPolicy: {
        systemPrompt: [
          '你是 SPARK 页面模型编辑 Agent。',
          '必须先读取场景注册知识：场景、流程、荷载、工具。',
          '具体业务需求与限制不预注册；必须通过 edit.ask 反问用户，再通过 edit.confirmRequirements 固化为 requirements 货载。',
          '工具只是运行载体；SparkNode.props 等 Vue 组件属性属于荷载注册，必须先查组件规格。',
          '禁止凭空猜测 PageModelHost、组件配置、DataKey 或业务限制。',
          '任何不清楚的业务目标、限制、组件 props、DataKey 或保存策略，都必须先查询 edit.ask 的工具注册和参数 schema。',
          '反问用户时必须调用 edit.ask，并按 reason/questions/id/prompt/options/allowFreeform 货载提交结构化问题。',
        ].join('\n'),
      },
    },
    flow: {
      description: '页面模型编辑流程：open -> inspect/ask/confirmRequirements -> write tools -> validate -> commit，可用 rollback 放弃未提交变更。',
      steps: [
        { id: 'open', title: '绑定 PageModelHost', tool: 'edit.open', critical: true },
        { id: 'clarify', title: '读取事实并必要时结构化反问', tools: ['edit.inspect', 'edit.ask'], critical: true },
        { id: 'confirm', title: '确认具体业务需求和限制', tool: 'edit.confirmRequirements', critical: true },
        { id: 'validate', title: '校验页面模型', tool: 'edit.validate', critical: true },
        { id: 'commit', title: '提交页面模型', tool: 'edit.commit', critical: true },
        { id: 'rollback', title: '失败恢复时回滚未提交变更', tool: 'edit.rollback' },
      ],
    },
    completion: {
      description: '页面模型编辑闭合要求：headless 运行结束前必须显式完成 edit.validate 与 edit.commit。',
      mode: 'manual',
      tools: ['edit.validate', 'edit.commit'],
      successSignals: ['flowState.validated=true', 'flowState.committed=true'],
      failureSignals: ['headless run finished without edit.commit', 'edit.validate failed', 'edit.commit failed'],
    },
    recovery: [
      {
        code: 'PAGE_MODEL_UNCOMMITTED_HEADLESS_RUN',
        when: 'headless 页面模型运行结束但 flowState.committed=false。',
        hint: '先用 edit.inspect 查看当前状态；若要放弃未提交修改，调用 edit.rollback；若要完成编辑，调用 edit.validate 后再调用 edit.commit。',
        tools: ['edit.inspect', 'edit.rollback', 'edit.validate', 'edit.commit'],
      },
    ],
    payloads: createPageModelPayloadRegistrations(),
    toolFamilies: [
      createEditToolFamily(),
      createTextModelToolFamily(),
      createSparkNodeTreeToolFamily(),
      createDatasetToolFamily(),
    ],
  }
}

export function projectPageModelPayloadContract(
  registration: PageModelKnowledgeRegistration,
): AiScenarioPayloadContract {
  return {
    description: 'PageModel 五级注册中的荷载层：上下文 host key、业务需求、SparkNode、Vue 组件 props、DataSet 和文本内容。',
    schema: {
      type: 'object',
      properties: Object.fromEntries(registration.payloads.map((payload) => [payload.key, payload.schema])),
      required: registration.payloads.filter((payload) => payload.required === true).map((payload) => payload.key),
    },
    slots: registration.payloads.map((payload) => ({
      key: payload.key,
      label: payload.title,
      description: payload.description,
      source: payloadSlotSource(payload.source),
      schema: payload.schema,
      ...(payload.required !== undefined ? { required: payload.required } : {}),
      ...(payload.examples !== undefined ? { examples: payload.examples } : {}),
    })),
    required: registration.payloads.filter((payload) => payload.required === true).map((payload) => payload.key),
  }
}

export function projectPageModelPayloadCapabilities(
  registration: PageModelKnowledgeRegistration,
): readonly AiScenarioCapability[] {
  return registration.payloads.map((payload) => ({
    id: `${registration.scenario.id}.payload.${payload.key}`,
    title: payload.title,
    kind: 'payload',
    description: payload.description,
    tags: ['page-model', 'payload', payload.source],
    ...(payload.relatedTools !== undefined ? { relatedTools: payload.relatedTools } : {}),
    ...(payload.required === true ? { requiredPayloadKeys: [payload.key] } : {}),
  }))
}
