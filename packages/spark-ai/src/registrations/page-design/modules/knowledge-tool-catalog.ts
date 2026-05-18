import { LlmParamsValidator, type AiFunctionRegistration, type FunctionFailureMode } from '../../../core'
import { SPARK_COMPONENT_PAYLOAD_REF } from '../payloads/component-payload-catalog'
import { noParamsSchema, paramsSchema, stringSchema } from './json-schema-helpers'

export type PageDesignKnowledgeFunctionFailureMode = FunctionFailureMode
export type PageDesignKnowledgeFunctionId =
  | 'queryFunctions'
  | 'queryModules'
  | 'guideFunction'
  | 'queryPayloads'
  | 'guidePayload'

const NO_PARAMS = noParamsSchema('queryModules 不接受参数，请传 {} 或留空。')

export const KNOWLEDGE_CATALOG_ROWS = [
  {
    functionId: 'queryFunctions',
    description: '查询当前 AI 会话可调用的函数目录（按 modulePath/moduleId/keyword 过滤）。',
    paramsSchema: paramsSchema({
      modulePath: stringSchema('按模块路径过滤，例如 knowledge、nodeTree、dataset。'),
      moduleId: stringSchema('按模块 ID 精确过滤。'),
      keyword: stringSchema('按 action/description/modulePath 模糊搜索。'),
    }),
    resultSchema: {
      items: 'AiKnowledgeFunctionSummary[] — 轻量函数目录（action、模块、描述、顶层参数名、失败码）；完整 paramsSchema/usageRules/failureModes 请用 guideFunction(action) 按需查询。',
    },
    example: {},
    usageRules: [
      '需要确认某个能力是否可调用，先查函数目录。',
      '再用 guideFunction(action) 查看单函数完整指南。',
    ],
    failureModes: [],
  },
  {
    functionId: 'queryModules',
    description: '查询当前 AI 会话的模块目录（含根模块与子模块）。',
    paramsSchema: NO_PARAMS,
    resultSchema: {
      items: 'AiKnowledgeModuleSummary[] — 轻量模块目录（moduleId/modulePath/name/description/functionCount/childModuleCount），不包含函数 schema。',
    },
    example: {},
    usageRules: [
      '用于确认模块边界与模块路径。',
    ],
    failureModes: [],
  },
  {
    functionId: 'guideFunction',
    description: '查询单个函数指南（按 action 精确查询）。',
    paramsSchema: paramsSchema({
      action: stringSchema('函数 action，例如 page-1@nodeTree@addNode。', { minLength: 1 }),
    }, ['action']),
    resultSchema: {
      guide: 'AiRuntimeFunctionExposure — 函数完整指南（参数 schema、规则、失败模式）。',
    },
    example: {
      action: 'page-1@nodeTree@addNode',
    },
    usageRules: [
      '执行函数前先查 guideFunction，避免参数结构猜测。',
    ],
    failureModes: [
      {
        code: 'FUNCTION_NOT_FOUND',
        when: 'action 不在当前会话函数目录中。',
        fix: '先调用 queryFunctions 确认 action，再重试。',
      },
    ],
  },
  {
    functionId: 'queryPayloads',
    description: '查询 page-design 组件目录，返回可用于 SparkNode node 参数的组件 type 摘要。',
    paramsSchema: paramsSchema({
      category: stringSchema('组件分类过滤，例如 container / field / group / meta。'),
      keyword: stringSchema('按组件 type、描述或分类模糊搜索。'),
      expression: stringSchema('JMESPath 表达式，作用于组件目录视图 { components, registry, capabilities, summary }；用于选择组件 type，结果统一规整为 key/description。'),
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 40,
        description: '最多返回多少条组件目录摘要；默认 24，最大 40。',
      },
    }),
    resultSchema: {
      payloadRef: `string — 固定为 ${SPARK_COMPONENT_PAYLOAD_REF}`,
      items: 'ParameterPayloadSummary[] — 轻量组件目录摘要，仅包含 key 与 description；不含 category、payloadRef、paramsSchema，完整参数结构请用 guidePayload(key) 按需查询。',
    },
    example: {
      expression: 'components[?category==`container`].type',
      limit: 12,
    },
    usageRules: [
      '新增或替换组件前，若不确定 type，先按关键词或分类查询组件目录。',
      '复杂筛选优先用 expression 对组件目录执行 JMESPath，例如 components[?category==`field`].type 或 registry.containers。',
      'queryPayloads 默认只返回前 24 条摘要；需要更多时可传 limit，但完整组件参数只能通过 guidePayload(key) 查询。',
      `无需传 payloadRef；本模块固定查询 ${SPARK_COMPONENT_PAYLOAD_REF}。`,
    ],
    failureModes: [],
  },
  {
    functionId: 'guidePayload',
    description: '读取指定组件 type 的 SparkNode 参数荷载指南，返回标准 paramsSchema 与原始组件语义指南。',
    paramsSchema: paramsSchema({
      key: stringSchema('组件 type，例如 r-table、r-form、el-button。', { minLength: 1 }),
    }, ['key']),
    resultSchema: {
      guide: 'ParameterPayloadGuide — 组件 SparkNode 参数荷载指南；paramsSchema 与函数参数协议同源，sourceGuide 保留组件目录原始语义（分类、props 分组、事件、绑定、子组件、fail-fast 检查）。',
    },
    example: {
      key: 'r-table',
    },
    usageRules: [
      '构造 nodeTree.addNode / replaceNode / addNodes / replaceNodes 的 node 参数前，必须先读取目标 type 的指南。',
      '返回 PAYLOAD_NOT_FOUND 时改用 queryPayloads 重新选择可用组件，不要反复用同一个缺失 key 重试。',
    ],
    failureModes: [
      {
        code: 'PAYLOAD_NOT_FOUND',
        when: `key 不存在于 ${SPARK_COMPONENT_PAYLOAD_REF} 参数荷载目录。`,
        fix: '先调用 queryPayloads 选择可用组件 type。',
      },
    ],
  },
] as const satisfies readonly AiFunctionRegistration[]

export function validateKnowledgeParams(functionId: string, params: unknown): string | null {
  const row = KNOWLEDGE_CATALOG_ROWS.find((r) => r.functionId === functionId)
  if (!row) return `未知 ${functionId} 函数`
  const result = LlmParamsValidator.validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
  return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
}
