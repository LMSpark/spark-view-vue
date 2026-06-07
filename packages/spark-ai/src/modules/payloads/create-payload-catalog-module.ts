/**
 * 将参数荷载目录注册为标准 AiModule（Vue 组件目录等只读契约走同一 module 协议）。
 *
 * LLM 路径：module_guide(kind) → queryPayloads(L2) → guidePayload(L3) → 消费方 function / module_script。
 */

import {
  booleanSchema,
  coerceJsonValue,
  numberSchema,
  paramsSchema,
  stringSchema,
} from '../../json'
import { AiModule, AiModuleResult } from '../protocol'
import type {
  AiModulePayloadQueryFilter,
  AiModulePayloadRegistry,
} from './module-parameter-payload-registry'
import {
  PAYLOAD_GUIDE_FUNCTION_NAME,
  PAYLOAD_QUERY_FUNCTION_NAME,
} from './payload-catalog-constants'

export type CreatePayloadCatalogModuleOptions = Readonly<{
  kind: string
  name: string
  description: string
  registry: AiModulePayloadRegistry
  parentKind?: string
  catalogInstanceId?: string
}>

const DEFAULT_CATALOG_INSTANCE_ID = 'catalog'

const QUERY_PAYLOADS_PARAMS_SCHEMA = paramsSchema({
  moduleKind: stringSchema('消费方 module kind，例如 node-tree。'),
  payloadRef: stringSchema('provider 命名空间，例如 spark.component。'),
  key: stringSchema('精确匹配组件 type / payload key。'),
  category: stringSchema('分类过滤，例如 container / field。'),
  keyword: stringSchema('关键词过滤 type 或 description。'),
  expression: stringSchema('provider 自定义投影表达式。'),
  configurableOnly: booleanSchema('仅返回可配置条目。'),
  limit: numberSchema('最多返回条数。'),
})

const GUIDE_PAYLOAD_PARAMS_SCHEMA = paramsSchema({
  moduleKind: stringSchema('消费方 module kind。'),
  payloadRef: stringSchema('provider 命名空间。'),
  key: stringSchema('目录 key，例如 r-form。'),
}, ['key'])

/** 构造只读 payload catalog AiModule；registry 须已 register 对应 provider。 */
export function createPayloadCatalogModule(options: CreatePayloadCatalogModuleOptions): AiModule {
  const explicitCatalogInstanceId = options.catalogInstanceId?.trim()
  const catalogInstanceId = explicitCatalogInstanceId === undefined || explicitCatalogInstanceId.length === 0
    ? DEFAULT_CATALOG_INSTANCE_ID
    : explicitCatalogInstanceId
  const { kind, name, description, registry } = options
  const parentKind = options.parentKind?.trim()

  return new AiModule({
    kind,
    name,
    description,
    ...(parentKind === undefined || parentKind.length === 0 ? {} : { parentKind }),
    functions: [
      {
        name: PAYLOAD_QUERY_FUNCTION_NAME,
        description: '按 moduleKind / payloadRef / category / keyword 查询荷载目录摘要；构造 SparkNode 前先选真实 key。',
        paramsSchema: QUERY_PAYLOADS_PARAMS_SCHEMA,
        usageRules: [
          '先 module_guide 理解 catalog 模块用途，再调用本函数选 key。',
          'moduleKind 与 payloadRef 必须与消费方 module_function_guide 中的 payloadLookupSteps 一致。',
        ],
        failureModes: [
          {
            code: 'UNKNOWN_PAYLOAD_PROVIDER',
            when: 'moduleKind/payloadRef 未注册 provider',
            fix: '回到 module_guide 确认 payloadRef，或检查 runtime 是否注册 spark-component catalog 模块。',
          },
        ],
      },
      {
        name: PAYLOAD_GUIDE_FUNCTION_NAME,
        description: '读取单个 payload key 的完整 paramsSchema 与 usageRules；addNode/setProps 参数只能按此 schema 构造。',
        paramsSchema: GUIDE_PAYLOAD_PARAMS_SCHEMA,
        usageRules: [
          'key 必须来自 queryPayloads 返回的真实条目，禁止猜测组件 type。',
          'paramsSchema 描述 SparkNode 合法形状；复杂 props 字段按 schema.properties 填写。',
        ],
        failureModes: [
          {
            code: 'PAYLOAD_KEY_NOT_FOUND',
            when: 'key 不存在或不可配置',
            fix: '重新 queryPayloads 选择存在的 key；internal/non-configurable 组件不可用于页面配置。',
          },
        ],
      },
    ],
    find: (ctx, childKind, query) => {
      if (childKind !== kind) return AiModuleResult.ok([])
      if (ctx.segments.length > 0) return AiModuleResult.ok([])
      const id = typeof query['id'] === 'string' && query['id'].trim().length > 0
        ? query['id'].trim()
        : catalogInstanceId
      return AiModuleResult.ok([{
        id,
        label: name,
        summary: description,
      }])
    },
    runner: (_ctx, functionName, args) => {
      if (functionName === PAYLOAD_QUERY_FUNCTION_NAME) {
        const summaries = registry.queryPayloads(readQueryFilter(args))
        return AiModuleResult.ok(coerceJsonValue(summaries) ?? [])
      }
      if (functionName === PAYLOAD_GUIDE_FUNCTION_NAME) {
        const key = readRequiredString(args, 'key')
        const moduleKind = readOptionalString(args, 'moduleKind') ?? kind
        const payloadRef = readOptionalString(args, 'payloadRef')
        if (payloadRef === undefined) {
          return AiModuleResult.failCode(
            'MISSING_PAYLOAD_REF',
            'guidePayload requires payloadRef.',
            'Call module_function_guide({ kind: "spark-component", functionName: "guidePayload" }) and pass payloadRef from payloadLookupSteps.',
          )
        }
        const guide = registry.guidePayload(moduleKind, payloadRef, key)
        if (guide === null) {
          return AiModuleResult.failCode(
            'PAYLOAD_KEY_NOT_FOUND',
            `payload key "${key}" is not available for ${moduleKind}/${payloadRef}.`,
            'Call queryPayloads to list real keys before guidePayload.',
          )
        }
        return AiModuleResult.ok(coerceJsonValue(guide) ?? null)
      }
      return AiModuleResult.failCode('UNKNOWN_FUNCTION', functionName)
    },
  })
}

function readQueryFilter(args: unknown): AiModulePayloadQueryFilter {
  if (!isRecord(args)) return {}
  const moduleKind = readOptionalString(args, 'moduleKind')
  const payloadRef = readOptionalString(args, 'payloadRef')
  const key = readOptionalString(args, 'key')
  const category = readOptionalString(args, 'category')
  const keyword = readOptionalString(args, 'keyword')
  const expression = readOptionalString(args, 'expression')
  const configurableOnly = readOptionalBoolean(args, 'configurableOnly')
  const limit = readOptionalNumber(args, 'limit')
  return {
    ...(moduleKind === undefined
      ? {}
      : { moduleKind }),
    ...(payloadRef === undefined
      ? {}
      : { payloadRef }),
    ...(key === undefined
      ? {}
      : { key }),
    ...(category === undefined
      ? {}
      : { category }),
    ...(keyword === undefined
      ? {}
      : { keyword }),
    ...(expression === undefined
      ? {}
      : { expression }),
    ...(configurableOnly === undefined
      ? {}
      : { configurableOnly }),
    ...(limit === undefined
      ? {}
      : { limit }),
  }
}

function readRequiredString(args: unknown, field: string): string {
  const value = isRecord(args) ? readOptionalString(args, field) : undefined
  if (value === undefined) {
    throw new Error(`guidePayload requires string field "${field}".`)
  }
  return value
}

function readOptionalString(record: Readonly<Record<string, unknown>>, field: string): string | undefined {
  const value = record[field]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

function readOptionalBoolean(record: Readonly<Record<string, unknown>>, field: string): boolean | undefined {
  const value = record[field]
  return typeof value === 'boolean' ? value : undefined
}

function readOptionalNumber(record: Readonly<Record<string, unknown>>, field: string): number | undefined {
  const value = record[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
