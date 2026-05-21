/**
 * PageDesign AI 模块注册。
 *
 * 整体架构：
 * PageDesignModule（主模块）
 * ├── LifecycleModule（生命周期：bootstrap / describeProgress / describeDesignFlow）
 * ├── TextModelModule（文本模型：readScript / writeScript / readStyle / writeStyle）
 * ├── KnowledgeModule（知识查询：queryFunctions / queryModules / guideModule / guideFunction / queryPayloads / guidePayload）
 * ├── NodeTreeModule（节点树：getNode / listChildren / addNode / setProps / moveNode / removeNode ...）
 * └── DatasetModule（数据集：表/列/视图/行/关系/依赖/聚合 CRUD）
 *
 * 流程：构造函数中创建 PageDesignService → 为各子模块创建 handler factory →
 * 包装为 PageDesignRuntimeModule → 注入到 RuntimeBackedBusinessModule 的子模块列表 →
 * LLM 调用函数时 executeFunctionCall 通过 validate/apply 链路路由到对应 handler。
 */

import type {
  AiFunctionRegistration,
  AiKnowledgeProjector,
  AiModuleRegistration,
  AiRuntimeFunctionCallResult,
  FunctionExecutionContext,
  LlmJsonSchema,
  LlmParameterSchemaRoot,
} from '@spark-view/spark-ai/protocol'
import {
  AiKnowledgeCatalog,
  AiRuntime,
  LlmParamsValidator,
} from '@spark-view/spark-ai/protocol'
import {
  RuntimeBackedBusinessModule,
  StaticAiToolModule,
  type RuntimeBackedExecuteFunctionCallOptions,
} from '../internal/registration-base'
import {
  PageDesignService,
  isPageDesignServiceResult,
  pageDesignServiceFailure,
  type PageDesignServiceContext,
  type PageDesignServiceMethodBinding,
} from '../../../page/workspace/services/page-design-service'
import type { PageDesignEditHost } from '../../../page/workspace/editing/page-design-edit-session'
import { DatasetModule } from './modules/dataset-tool-catalog'
import { LifecycleModule } from './modules/lifecycle-tool-catalog'
import { NodeTreeModule } from './modules/node-tree-tool-catalog'
import { TextModelModule } from './modules/text-model-tool-catalog'
import componentCatalogPayload from './payloads/component-catalog.json'

const PAGE_DESIGN_MODULE_ID = 'pageDesign'
const LIFECYCLE_MODULE_ID = 'lifecycle'
const TEXT_MODEL_MODULE_ID = 'textModel'
const NODE_TREE_MODULE_ID = 'nodeTree'
const DATASET_MODULE_ID = 'dataset'
const KNOWLEDGE_MODULE_ID = 'knowledge'

const LIFECYCLE_TOOL_MODULE = new LifecycleModule()
const TEXT_MODEL_TOOL_MODULE = new TextModelModule()
const NODE_TREE_TOOL_MODULE = new NodeTreeModule()
const DATASET_TOOL_MODULE = new DatasetModule()

export type PageDesignModuleId =
  | typeof LIFECYCLE_MODULE_ID
  | typeof TEXT_MODEL_MODULE_ID
  | typeof NODE_TREE_MODULE_ID
  | typeof DATASET_MODULE_ID
  | typeof KNOWLEDGE_MODULE_ID

interface PageDesignRuntimeContext {
  readonly instanceId: string
  readonly moduleId: typeof PAGE_DESIGN_MODULE_ID
  readonly moduleInstanceId: string
}

export interface PageDesignModuleOptions {
  readonly getEditToolHost: (context: PageDesignRuntimeContext) => PageDesignEditHost
}

type PageDesignFunctionApplyResult = object | AiRuntimeFunctionCallResult<unknown>
interface PageDesignFunctionApply {
  (args: unknown, context: FunctionExecutionContext): PageDesignFunctionApplyResult | Promise<PageDesignFunctionApplyResult>
}
interface PageDesignRuntimeFunctionRegistration extends AiFunctionRegistration {
  readonly apply: PageDesignFunctionApply
    readonly validate?: ((args: unknown, context: FunctionExecutionContext) => string | null) | undefined
}

interface PageDesignFunctionHandler {
  readonly functionId: string
  readonly validate?: ((args: unknown, context: FunctionExecutionContext) => string | null) | undefined
  readonly apply: PageDesignFunctionApply
}

interface PageDesignFunctionBindingRuntime {
  readonly service: PageDesignService
  readonly knowledge: AiKnowledgeProjector
}

interface PageDesignPayloadProp {
  readonly name: string
  readonly type?: string | undefined
  readonly required?: boolean | undefined
  readonly description?: string | undefined
  readonly schema?: LlmJsonSchema | undefined
}

interface PageDesignPayloadEntry {
  readonly type: string
  readonly filePath?: string | undefined
  readonly category?: string | undefined
  readonly description?: string | undefined
  readonly internal?: boolean | undefined
  readonly configurable?: boolean | undefined
  readonly props?: readonly PageDesignPayloadProp[] | undefined
  readonly emits?: readonly unknown[] | undefined
  readonly source?: string | undefined
}

interface PageDesignPayloadCatalog {
  readonly version: string
  readonly componentCount: number
  readonly components: Readonly<Record<string, PageDesignPayloadEntry>>
}

// =========================================================
// Payload 类型校验器（组件荷载目录 JSON 验证）
// =========================================================

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
}

function isLlmJsonSchema(value: unknown): value is LlmJsonSchema {
  return typeof value === 'boolean' || isObjectRecord(value)
}

function isPageDesignPayloadProp(value: unknown): value is PageDesignPayloadProp {
  return isObjectRecord(value)
    && typeof value['name'] === 'string'
    && isOptionalString(value['type'])
    && isOptionalBoolean(value['required'])
    && isOptionalString(value['description'])
    && (value['schema'] === undefined || isLlmJsonSchema(value['schema']))
}

function isPageDesignPayloadEntry(value: unknown): value is PageDesignPayloadEntry {
  return isObjectRecord(value)
    && typeof value['type'] === 'string'
    && isOptionalString(value['filePath'])
    && isOptionalString(value['category'])
    && isOptionalString(value['description'])
    && isOptionalBoolean(value['internal'])
    && isOptionalBoolean(value['configurable'])
    && (value['props'] === undefined || (Array.isArray(value['props']) && value['props'].every(isPageDesignPayloadProp)))
    && (value['emits'] === undefined || Array.isArray(value['emits']))
    && isOptionalString(value['source'])
}

function readPageDesignPayloadCatalog(value: unknown): PageDesignPayloadCatalog {
  if (!isObjectRecord(value) || typeof value['version'] !== 'string' || typeof value['componentCount'] !== 'number' || !isObjectRecord(value['components'])) {
    throw new Error('PageDesign component payload catalog is invalid')
  }
  const components: Record<string, PageDesignPayloadEntry> = {}
  for (const [key, entry] of Object.entries(value['components'])) {
    if (!isPageDesignPayloadEntry(entry)) {
      throw new Error(`PageDesign component payload catalog entry is invalid: ${key}`)
    }
    components[key] = entry
  }
  return {
    version: value['version'],
    componentCount: value['componentCount'],
    components,
  }
}

// =========================================================
// PageDesign 运行时子模块（将 handler 包装为 StaticAiToolModule）
// =========================================================

class PageDesignRuntimeToolModule extends StaticAiToolModule {
  constructor(
    moduleId: PageDesignModuleId,
    name: string,
    description: string,
    prompt: string,
    functionRegistrations: readonly PageDesignRuntimeFunctionRegistration[],
  ) {
    super({
      moduleId,
      name,
      description,
      prompt,
      functionRegistrations,
    })
  }
}

const PAGE_DESIGN_COMPONENT_CATALOG: PageDesignPayloadCatalog = readPageDesignPayloadCatalog(componentCatalogPayload)

// =========================================================
// 组件荷载查询函数（queryPayloads / guidePayload）
// =========================================================

const PAGE_DESIGN_PAYLOAD_FUNCTIONS: readonly AiFunctionRegistration[] = [
  {
    functionId: 'queryPayloads',
    description: '查询可用于当前页面设计的组件参数荷载目录，支持 category/keyword/key 过滤。',
    paramsSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '按组件 category 精确过滤，例如 container、field、display。' },
        keyword: { type: 'string', description: '按 type、category、description 或 filePath 模糊搜索。' },
        key: { type: 'string', description: '按组件 type/key 精确查询。' },
        configurableOnly: { type: 'boolean', description: '为 true 时仅返回 configurable=true 且 internal=false 的组件。' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: '最多返回条数，默认 20。' },
      },
      additionalProperties: false,
    },
    resultSchema: {
      items: 'PageDesignPayloadSummary[] — 组件荷载摘要，包含 key/type/category/description/requiredProps。',
    },
    usageRules: [
      '新增或替换 SparkNode 前先查询候选组件。',
      '拿到目标 key 后再调用 guidePayload 获取完整 paramsSchema。',
    ],
  },
  {
    functionId: 'guidePayload',
    description: '查询单个组件 type/key 的参数荷载指南，用于构造合法 SparkNode props。',
    paramsSchema: {
      type: 'object',
      required: ['key'],
      properties: {
        key: { type: 'string', minLength: 1, description: '组件 type/key，例如 renderer-button。' },
      },
      additionalProperties: false,
    },
    resultSchema: {
      payload: 'PageDesignPayloadGuide — 组件完整荷载指南，包含 props 与 paramsSchema。',
    },
    usageRules: [
      '构造 node.props 前必须按目标组件 key 查询指南。',
      '如果返回 PAYLOAD_NOT_FOUND，先 queryPayloads 选择替代组件，不要猜 props。',
    ],
    failureModes: [
      {
        code: 'PAYLOAD_NOT_FOUND',
        when: 'key 不存在于组件荷载目录。',
        fix: '先调用 queryPayloads 按 category 或 keyword 选择可用组件。',
      },
    ],
  },
]

// =========================================================
// 工具函数：参数解析和路由
// =========================================================

function toObject(value: unknown): Record<string, unknown> | null {
  return isObjectRecord(value) ? value : null
}

function readRequiredStringArg(args: unknown, key: string): string {
  const input = toObject(args)
  const value = input?.[key]
  if (typeof value !== 'string') {
    throw new Error(`Missing required string argument: ${key}`)
  }
  return value
}

function isPageDesignRuntimeFunctionRegistration(
  value: AiFunctionRegistration,
): value is PageDesignRuntimeFunctionRegistration {
  return 'apply' in value
    && typeof value.apply === 'function'
    && (!('validate' in value) || value.validate === undefined || typeof value.validate === 'function')
}

function requirePageDesignRuntimeFunctionRegistration(
  value: AiFunctionRegistration,
): PageDesignRuntimeFunctionRegistration {
  if (!isPageDesignRuntimeFunctionRegistration(value)) {
    throw new Error(`PageDesign function registration is not executable: ${value.functionId}`)
  }
  return value
}

function toServiceContext(context: PageDesignRuntimeContext | FunctionExecutionContext): PageDesignServiceContext {
  return {
    requestId: context.instanceId,
    pageId: context.moduleInstanceId,
  }
}

function toDesignFlowQuery(args: unknown): { phase?: string; step?: number; afterStep?: number } {
  const input = toObject(args) ?? {}
  return {
    ...(typeof input['phase'] === 'string' ? { phase: input['phase'] } : {}),
    ...(typeof input['step'] === 'number' ? { step: input['step'] } : {}),
    ...(typeof input['afterStep'] === 'number' ? { afterStep: input['afterStep'] } : {}),
  }
}

function toKnowledgeScope(context: FunctionExecutionContext): { moduleId: string; moduleInstanceId: string } {
  return {
    moduleId: context.moduleId,
    moduleInstanceId: context.moduleInstanceId,
  }
}

function validateFunctionParams(row: AiFunctionRegistration, args: unknown): string | null {
  const result = LlmParamsValidator.validateLlmDeserializedParams(args ?? {}, row.paramsSchema)
  return result.ok ? null : LlmParamsValidator.formatLlmParamValidationIssues(result.issues)
}

function payloadRows(): PageDesignPayloadEntry[] {
  return Object.values(PAGE_DESIGN_COMPONENT_CATALOG.components)
}

function payloadKey(entry: PageDesignPayloadEntry): string {
  return entry.type
}

function payloadMatchesKeyword(entry: PageDesignPayloadEntry, keyword: string): boolean {
  const haystack = [
    entry.type,
    entry.category ?? '',
    entry.description ?? '',
    entry.filePath ?? '',
  ].join('\n').toLowerCase()
  return haystack.includes(keyword.toLowerCase())
}

function payloadLimit(input: Record<string, unknown>): number {
  const rawLimit = input['limit']
  if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit)) return 20
  return Math.min(Math.max(rawLimit, 1), 50)
}

function findPayloadEntry(key: string): PageDesignPayloadEntry | null {
  const direct = PAGE_DESIGN_COMPONENT_CATALOG.components[key]
  if (direct !== undefined) return direct
  return payloadRows().find((entry) => entry.type === key) ?? null
}

function summarizePayload(entry: PageDesignPayloadEntry): Record<string, unknown> {
  const props = entry.props ?? []
  const requiredProps = props.filter((prop) => prop.required === true).map((prop) => prop.name)
  return {
    key: payloadKey(entry),
    type: entry.type,
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.filePath === undefined ? {} : { filePath: entry.filePath }),
    configurable: entry.configurable === true,
    internal: entry.internal === true,
    propCount: props.length,
    ...(requiredProps.length === 0 ? {} : { requiredProps }),
  }
}

function createPayloadParamsSchema(entry: PageDesignPayloadEntry): LlmParameterSchemaRoot {
  const properties: Record<string, LlmJsonSchema> = {}
  const required: string[] = []
  for (const prop of entry.props ?? []) {
    properties[prop.name] = prop.schema ?? {
      type: 'string',
      ...(prop.description === undefined ? {} : { description: prop.description }),
    }
    if (prop.required === true) required.push(prop.name)
  }
  return {
    type: 'object',
    properties,
    ...(required.length === 0 ? {} : { required }),
    additionalProperties: true,
  }
}

function queryPageDesignPayloads(args: unknown): AiRuntimeFunctionCallResult<unknown> {
  const input = toObject(args) ?? {}
  const category = typeof input['category'] === 'string' ? input['category'].trim() : ''
  const keyword = typeof input['keyword'] === 'string' ? input['keyword'].trim() : ''
  const key = typeof input['key'] === 'string' ? input['key'].trim() : ''
  const configurableOnly = input['configurableOnly'] === true
  const limit = payloadLimit(input)

  let rows = payloadRows()
  if (category.length > 0) {
    rows = rows.filter((entry) => entry.category === category)
  }
  if (keyword.length > 0) {
    rows = rows.filter((entry) => payloadMatchesKeyword(entry, keyword))
  }
  if (key.length > 0) {
    rows = rows.filter((entry) => payloadKey(entry) === key || entry.type === key)
  }
  if (configurableOnly) {
    rows = rows.filter((entry) => entry.configurable === true && entry.internal !== true)
  }

  const items = rows.slice(0, limit).map((entry) => summarizePayload(entry))
  return {
    ok: true,
    data: {
      version: PAGE_DESIGN_COMPONENT_CATALOG.version,
      total: rows.length,
      items,
    },
    summary: `已返回 ${items.length}/${rows.length} 个组件荷载摘要`,
  }
}

function guidePageDesignPayload(args: unknown): AiRuntimeFunctionCallResult<unknown> {
  const input = toObject(args) ?? {}
  const key = typeof input['key'] === 'string' ? input['key'].trim() : ''
  if (key.length === 0) {
    return pageDesignServiceFailure('INVALID_PAYLOAD_KEY', 'guidePayload requires a non-empty key', '传入 { key: "component-type" }。')
  }
  const entry = findPayloadEntry(key)
  if (entry === null) {
    return pageDesignServiceFailure('PAYLOAD_NOT_FOUND', `组件荷载 "${key}" 不存在`, '先调用 queryPayloads 按 category 或 keyword 选择可用组件。')
  }
  return {
    ok: true,
    data: {
      payload: {
        ...summarizePayload(entry),
        props: entry.props ?? [],
        emits: entry.emits ?? [],
        paramsSchema: createPayloadParamsSchema(entry),
      },
    },
    summary: `${key} 组件荷载指南已返回`,
  }
}

function createServiceMethodBinding(row: AiFunctionRegistration, methodName: string, mutates: boolean): PageDesignServiceMethodBinding {
  const parts = [`参数格式: ${JSON.stringify(row.paramsSchema)}`]
  const example = row.example ?? {}
  if (Object.keys(example).length > 0) {
    parts.push(`示例: ${JSON.stringify(example)}`)
  }
  if (row.usageRules && row.usageRules.length > 0) {
    parts.push(`关键规则: ${row.usageRules.join('；')}`)
  }
  return {
    serviceLabel: row.functionId,
    methodName,
    mutates,
    fixHint: parts.join('；'),
  }
}

// =========================================================
// Handler Factory：为各子模块创建 PageDesignFunctionHandler
// =========================================================
function createLifecycleHandlers(
  service: PageDesignService,
): readonly PageDesignFunctionHandler[] {
  return LIFECYCLE_TOOL_MODULE.functionRegistrations.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateFunctionParams(row, args),
    apply: (_args, context) => {
      switch (row.functionId) {
        case 'bootstrap':
          return service.bootstrap(toServiceContext(context))
        case 'describeProgress':
          return service.describeProgress(toServiceContext(context))
        case 'describeDesignFlow':
          return service.describeDesignFlow(toServiceContext(context), toDesignFlowQuery(_args))
        default:
          throw new Error(`unreachable: ${row.functionId}`)
      }
    },
  }))
}

// =========================================================
// TextModel handler factory
// =========================================================
function createTextModelHandlers(
  service: PageDesignService,
): readonly PageDesignFunctionHandler[] {
  return TEXT_MODEL_TOOL_MODULE.functionRegistrations.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateFunctionParams(row, args),
    apply: (args, context) => {
      switch (row.functionId) {
        case 'readScript':
          return service.readTextModel(toServiceContext(context), 'script')
        case 'writeScript':
          return service.writeTextModel(toServiceContext(context), 'script', readRequiredStringArg(args, 'content'))
        case 'readStyle':
          return service.readTextModel(toServiceContext(context), 'style')
        case 'writeStyle':
          return service.writeTextModel(toServiceContext(context), 'style', readRequiredStringArg(args, 'content'))
        default:
          throw new Error(`unreachable: ${row.functionId}`)
      }
    },
  }))
}

// =========================================================
// Knowledge handler factory
// =========================================================
function createKnowledgeHandlers(
  runtime: PageDesignFunctionBindingRuntime,
): readonly PageDesignFunctionHandler[] {
  const rows = [...new AiKnowledgeCatalog().parameterTable, ...PAGE_DESIGN_PAYLOAD_FUNCTIONS]
  return rows.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateFunctionParams(row, args),
    apply: (args, context) => {
      switch (row.functionId) {
        case 'queryFunctions': {
          const input = toObject(args) ?? {}
          const items = runtime.knowledge.queryFunctions(toKnowledgeScope(context), {
            ...(typeof input['modulePath'] === 'string' ? { modulePath: input['modulePath'] } : {}),
            ...(typeof input['moduleId'] === 'string' ? { moduleId: input['moduleId'] } : {}),
            ...(typeof input['keyword'] === 'string' ? { keyword: input['keyword'] } : {}),
          })
          return { ok: true, data: { items }, summary: `已返回 ${items.length} 个函数目录项` }
        }
        case 'queryModules': {
          const items = runtime.knowledge.queryModules(toKnowledgeScope(context))
          return { ok: true, data: { items }, summary: `已返回 ${items.length} 个模块目录项` }
        }
        case 'guideModule': {
          const modulePath = readRequiredStringArg(args, 'modulePath')
          const guide = runtime.knowledge.guideModule(toKnowledgeScope(context), modulePath)
          if (guide === null) {
            return pageDesignServiceFailure(
              'MODULE_NOT_FOUND',
              `模块 "${modulePath}" 不在当前会话模块目录中`,
              '先调用 queryModules 确认 modulePath，再重试。',
            )
          }
          return { ok: true, data: { guide }, summary: `${modulePath} 模块指南已返回` }
        }
        case 'guideFunction': {
          const action = readRequiredStringArg(args, 'action')
          const guide = runtime.knowledge.guideFunction(toKnowledgeScope(context), action)
          if (guide === null) {
            return pageDesignServiceFailure(
              'FUNCTION_NOT_FOUND',
              `函数 "${action}" 不在当前会话函数目录中`,
              '先调用 queryFunctions 确认 action，再重试。',
            )
          }
          return { ok: true, data: { guide }, summary: `${action} 函数指南已返回` }
        }
        case 'queryPayloads':
          return queryPageDesignPayloads(args)
        case 'guidePayload':
          return guidePageDesignPayload(args)
        default:
          throw new Error(`unreachable: ${row.functionId}`)
      }
    },
  }))
}

// =========================================================
// NodeTree handler factory
// =========================================================
function createNodeTreeHandlers(
  service: PageDesignService,
): readonly PageDesignFunctionHandler[] {
  return NODE_TREE_TOOL_MODULE.functionRegistrations.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateFunctionParams(row, args),
    apply: (args, context) => {
      const methodBinding = createServiceMethodBinding(row, row.functionId, ['addNode', 'addNodes', 'moveNode', 'setProps', 'setPropsBatch', 'replaceNode', 'replaceNodes', 'removeNode', 'removeNodes'].includes(row.functionId))
      return service.useNodeTreeMethod(toServiceContext(context), args, methodBinding)
    },
  }))
}

// =========================================================
// Dataset handler factory
// =========================================================
function createDatasetHandlers(
  service: PageDesignService,
): readonly PageDesignFunctionHandler[] {
  const mutates = new Set([
    'undo', 'redo', 'clearHistory',
    'createColumn', 'updateColumn', 'renameColumn', 'deleteColumn',
    'createTable', 'updateTable', 'renameTable', 'deleteTable',
    'createView', 'updateView', 'deleteView',
    'createRow', 'createRows', 'updateRow', 'updateRows', 'deleteRow', 'deleteRows',
    'createRelation', 'updateRelation', 'deleteRelation',
    'createDependency', 'updateDependency', 'deleteDependency',
    'addAggregate', 'updateAggregate', 'removeAggregate',
    'setComputeExpression', 'clearComputeExpression',
  ])
  return DATASET_TOOL_MODULE.functionRegistrations.map((row) => ({
    functionId: row.functionId,
    validate: (args) => validateFunctionParams(row, args),
    apply: (args, context) => {
      const methodBinding = createServiceMethodBinding(row, row.functionId, mutates.has(row.functionId))
      return service.useDatasetMethod(toServiceContext(context), args, methodBinding)
    },
  }))
}

function createPageDesignRuntimeModule(
  moduleId: PageDesignModuleId,
  name: string,
  description: string,
  prompt: string,
  handlers: readonly PageDesignFunctionHandler[],
): AiModuleRegistration {
  const allRows: readonly AiFunctionRegistration[] = [
    ...LIFECYCLE_TOOL_MODULE.functionRegistrations,
    ...TEXT_MODEL_TOOL_MODULE.functionRegistrations,
    ...NODE_TREE_TOOL_MODULE.functionRegistrations,
    ...DATASET_TOOL_MODULE.functionRegistrations,
    ...new AiKnowledgeCatalog().parameterTable,
    ...PAGE_DESIGN_PAYLOAD_FUNCTIONS,
  ]
  const rowsByFunctionId = new Map(allRows.map((row) => [row.functionId, row]))
  const functions: readonly PageDesignRuntimeFunctionRegistration[] = handlers.map((handler) => {
    const row = rowsByFunctionId.get(handler.functionId)
    return {
      functionId: handler.functionId,
      description: row?.description ?? handler.functionId,
      paramsSchema: row?.paramsSchema ?? { type: 'object', properties: {} },
      ...(handler.validate === undefined ? {} : { validate: handler.validate }),
      apply: handler.apply,
    }
  })

  return new PageDesignRuntimeToolModule(moduleId, name, description, prompt, functions)
}

/**
 * PageDesign 主模块。
 *
 * 构造函数中按顺序创建：PageDesignService → 5 个子模块 runtime → 注入 RuntimeBackedBusinessModule。
 * executeFunctionCall 通过 PageDesignRuntimeFunctionRegistration.validate / apply 路由到对应 handler。
 */
export class PageDesignModule extends RuntimeBackedBusinessModule {
  static readonly moduleId = PAGE_DESIGN_MODULE_ID

  static assertContext(context: { readonly moduleId: string }): asserts context is PageDesignRuntimeContext {
    if (context.moduleId !== PAGE_DESIGN_MODULE_ID) {
      throw new Error(`PageDesign context moduleId must be ${PAGE_DESIGN_MODULE_ID}, got ${context.moduleId}`)
    }
  }

  private readonly service: PageDesignService

  constructor(options: PageDesignModuleOptions) {
    const service = new PageDesignService({
      getEditHost: (context) => options.getEditToolHost({
        instanceId: context.requestId,
        moduleId: PAGE_DESIGN_MODULE_ID,
        moduleInstanceId: context.pageId,
      }),
    })
    const core = new AiRuntime()
    const runtime: PageDesignFunctionBindingRuntime = {
      service,
      knowledge: core.getKnowledgeProjection(),
    }
    const modules = [
      createPageDesignRuntimeModule(LIFECYCLE_MODULE_ID, 'Page Design Lifecycle', '页面设计编辑运行态引导与进度查询。', '', createLifecycleHandlers(service)),
      createPageDesignRuntimeModule(TEXT_MODEL_MODULE_ID, 'Page Design Text Model', '当前页面 script.js/style.css live 文本模型读写。', '', createTextModelHandlers(service)),
      createPageDesignRuntimeModule(KNOWLEDGE_MODULE_ID, 'Page Design Knowledge', '当前页面设计组件参数荷载知识查询。', '', createKnowledgeHandlers(runtime)),
      createPageDesignRuntimeModule(NODE_TREE_MODULE_ID, 'Page Design Node Tree', '当前页面 SparkNodeTree/rule.json 结构读写。', '', createNodeTreeHandlers(service)),
      createPageDesignRuntimeModule(DATASET_MODULE_ID, 'Page Design DataSet', '当前页面 DataSetCrudTool/pagedata.json 数据空间读写。', '', createDatasetHandlers(service)),
    ]
    super({
      moduleId: PAGE_DESIGN_MODULE_ID,
      name: 'Page Design',
      description: '单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。',
      prompt: '你正在处理页面设计业务，支持 lifecycle、textModel、nodeTree、dataset、knowledge 五大子模块。',
      modules,
      runtime: core,
    })
    this.service = service
  }

  /** LLM 函数调用入口：通过 PageDesignRuntimeFunctionRegistration.validate / apply 路由到 handler。 */
  override async executeFunctionCall(options: RuntimeBackedExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>> {
    PageDesignModule.assertContext(options)
    return this.executeRegisteredFunctionCall({
      ...options,
      validate: ({ functionRegistration, args, context }) => (
        requirePageDesignRuntimeFunctionRegistration(functionRegistration).validate?.(args, context) ?? null
      ),
      run: ({ functionRegistration, args, context }) => (
        requirePageDesignRuntimeFunctionRegistration(functionRegistration).apply(args, context)
      ),
      normalizeResult: (value) => isPageDesignServiceResult(value)
        ? value
        : {
          ok: true,
          data: value,
          summary: `${options.action} executed`,
        },
      errorFix: `Fix ${options.action} implementation or retry with valid args after checking page-design state.`,
    })
  }

  override releaseModuleInstance(moduleInstanceId: string): void {
    this.service.releasePage(moduleInstanceId)
  }
}
