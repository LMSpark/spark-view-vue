/**
 * pageDesign 知识模块：spark-component catalog + VCM 指南模块（config-page / node-tree / dataset 族）。
 */
import {
  AiModule,
  AiModulePayloadRegistry,
  AiModuleResult,
  createPayloadCatalogModule,
  resolveModuleMetadataJson,
  toModuleFunctionResultApiMetadata,
  type AiApiActionMetadata,
  type AiApiObjectMetadata,
  type AiModuleFunctionMetadata,
  type AiModuleMetadataJson,
  type AiModulePayloadMetadata,
} from '@spark-appworks/spark-ai/modules'
import componentCatalogDocumentJson from './payload/component-catalog.json'
import {
  createSparkComponentCatalogProvider,
  readSparkComponentCatalogDocument,
  SPARK_COMPONENT_CONSUMER_KIND,
  SPARK_COMPONENT_PAYLOAD_REF,
} from './spark-component-catalog-provider'

export const SPARK_COMPONENT_MODULE_KIND = 'spark-component'
export const SPARK_COMPONENT_CATALOG_INSTANCE_ID = 'catalog'

const PAGE_DESIGN_GUIDE_KINDS = [
  'config-page',
  'node-tree',
  'dataset',
  'data-table',
  'data-view',
] as const

type PageDesignGuideKind = typeof PAGE_DESIGN_GUIDE_KINDS[number]

const GUIDE_PARENT_KIND: Readonly<Record<PageDesignGuideKind, string>> = {
  'config-page': 'project',
  'node-tree': 'config-page',
  'dataset': 'config-page',
  'data-table': 'dataset',
  'data-view': 'data-table',
}

const NODE_TREE_PAYLOAD_FUNCTION_NAMES = new Set<string>([
  'addNode',
  'addNodes',
  'setProps',
  'setPropsBatch',
  'replaceNode',
  'replaceNodes',
  'replaceRoot',
])

export type PageDesignKnowledgeModuleOptions = Readonly<{
  apiRegistry?: Readonly<Record<string, AiApiObjectMetadata>>
}>

export type PageDesignSparkComponentModuleBundle = Readonly<{
  registry: AiModulePayloadRegistry
  catalogModule: AiModule
  guideModules: readonly AiModule[]
}>

export function createPageDesignSparkComponentModuleBundle(
  options: PageDesignKnowledgeModuleOptions = {},
): PageDesignSparkComponentModuleBundle {
  const catalog = readSparkComponentCatalogDocument(componentCatalogDocumentJson)
  const registry = new AiModulePayloadRegistry()
  registry.register(createSparkComponentCatalogProvider(catalog))

  const catalogModule = createPayloadCatalogModule({
    kind: SPARK_COMPONENT_MODULE_KIND,
    name: 'Spark Component Catalog',
    description: 'Vue 组件 SparkNode 契约目录；构造 rule.json 节点前必须先 queryPayloads / guidePayload。',
    registry,
    catalogInstanceId: SPARK_COMPONENT_CATALOG_INSTANCE_ID,
  })

  const guideModules = PAGE_DESIGN_GUIDE_KINDS.flatMap((kind) => {
    const api = options.apiRegistry?.[kind]
    if (api === undefined || options.apiRegistry === undefined) return []
    const resolvedApi = resolveGuideApiFromRegistry(kind, api, options.apiRegistry)
    if (kind === 'node-tree') {
      return [createMetadataGuideModule(resolvedApi, {
        parentKind: GUIDE_PARENT_KIND[kind],
        payloads: createNodeTreePayloads(),
        runnerHint: runnerHintForKind(kind),
        extraUsageRules: (actionName) => NODE_TREE_PAYLOAD_FUNCTION_NAMES.has(actionName)
          ? ['构造 SparkNode 前先 queryPayloads / guidePayload(spark.component)。', '结构改写优先 module_script。']
          : ['结构改写优先 module_script。'],
      })]
    }
    return [createMetadataGuideModule(resolvedApi, {
      parentKind: GUIDE_PARENT_KIND[kind],
      runnerHint: runnerHintForKind(kind),
    })]
  })

  return {
    registry,
    catalogModule,
    guideModules,
  }
}

function runnerHintForKind(kind: string): string {
  switch (kind) {
    case 'config-page':
      return '通过 project.openPageDesign(pageId) 进入 config-page，再使用 module_script 调用 this.editNodeTree(...) / this.editDataSet(...) / this.getFileText(...)。'
    case 'node-tree':
      return '通过 project.openPageDesign(pageId) 进入 config-page，再使用 module_script 调用 this.editNodeTree(callback).addNode(...)。'
    case 'dataset':
      return '通过 config-page.editDataSet(callback) 进入 dataset，再使用 module_script 调用 this.getTable(...).createColumn(...)。'
    case 'data-table':
      return '通过 dataset.getTable({ tableName }) 进入 data-table，再使用 module_script 调用 this.getView(...)。'
    case 'data-view':
      return '通过 data-table.getView({ viewId }) 进入 data-view，再使用 module_script 调用 this.setFilter(...) 等语义 API。'
    default:
      return '通过 module_script 在已打开 pageDesign 上下文中链式调用。'
  }
}

function createNodeTreePayloads(): readonly AiModulePayloadMetadata[] {
  return [{
    payloadRef: SPARK_COMPONENT_PAYLOAD_REF,
    description: 'Vue 组件 SparkNode 合法 type/props 目录。',
    requiredForFunctions: [...NODE_TREE_PAYLOAD_FUNCTION_NAMES],
  }]
}

function createMetadataGuideModule(
  api: AiApiObjectMetadata,
  options: Readonly<{
    parentKind: string
    payloads?: readonly AiModulePayloadMetadata[]
    runnerHint: string
    extraUsageRules?: (actionName: string) => readonly string[]
  }>,
): AiModule {
  return new AiModule({
    kind: api.kind,
    name: api.name,
    description: api.description,
    parentKind: options.parentKind,
    ...(options.payloads === undefined ? {} : { payloads: options.payloads }),
    functions: api.actions.map(action => toGuideFunctionMetadata(action, options.extraUsageRules)),
    runner: (_ctx, functionName) => AiModuleResult.failCode(
      'DIRECT_CALL_NOT_SUPPORTED',
      `${api.kind}.${functionName} 不能作为 direct function 调用。`,
      options.runnerHint,
    ),
  })
}

function toGuideFunctionMetadata(
  action: AiApiActionMetadata,
  extraUsageRules?: (actionName: string) => readonly string[],
): AiModuleFunctionMetadata {
  const usageRules = action.usageRules ?? []
  const guideRules = extraUsageRules?.(action.name) ?? ['结构改写优先 module_script。']

  return {
    name: action.name,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    ...(action.resultApis === undefined ? {} : {
      resultApis: action.resultApis.map(toModuleFunctionResultApiMetadata),
    }),
    usageRules: [...usageRules, ...guideRules],
    ...(action.requiredBeforeCall === undefined ? {} : { requiredBeforeCall: [...action.requiredBeforeCall] }),
    ...(action.failureModes === undefined ? {} : { failureModes: action.failureModes.map(mode => ({ ...mode })) }),
  }
}

function resolveGuideApiFromRegistry(
  kind: string,
  api: AiApiObjectMetadata,
  apiRegistry: Readonly<Record<string, AiApiObjectMetadata>>,
): AiApiObjectMetadata {
  const resolved = resolveModuleMetadataJson({
    schemaVersion: 2,
    rootApi: api,
    apiRegistry,
  } satisfies AiModuleMetadataJson)
  if (resolved.rootApi.kind !== kind) {
    throw new Error(`pageDesign guide apiRegistry["${kind}"] kind mismatch: "${resolved.rootApi.kind}".`)
  }
  return resolved.rootApi
}

export { SPARK_COMPONENT_CONSUMER_KIND, SPARK_COMPONENT_PAYLOAD_REF }
