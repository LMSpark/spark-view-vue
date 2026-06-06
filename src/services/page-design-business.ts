/**
 * pageDesign AI business registration.
 *
 * This app-layer service exposes the current ProjectModel to spark-ai without
 * making spark-project-model depend on AI runtime or generated metadata files.
 */
import {
  AiModuleAdapter,
  createSimpleInputContract,
  type AiAgentHost,
} from '@spark-appworks/spark-ai/agent'
import type { AiModuleMetadataJson, AiModulePathContext } from '@spark-appworks/spark-ai/modules'
import { resolveModuleMetadataJson } from '@spark-appworks/spark-ai/modules'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { pageDesignRuntimeMetadataDocument } from './page-design/page-design-module-metadata.runtime'

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'

export type PageDesignRunMode = 'create' | 'update' | 'fix'

export type PageDesignAllowedOperations = {
  nodeTree?: boolean
  dataSet?: boolean
  script?: boolean
  style?: boolean
  navigation?: boolean
}

export type PageDesignRunInput = {
  pageId: string
  description: string
  /** readPlanningProjection 的 effectiveDescription；runner 必填。 */
  effectiveDescription: string
  planningTitle?: string
  planningPath?: string
  mode?: PageDesignRunMode
  allowedOperations?: PageDesignAllowedOperations
  preserveExistingInteractions?: boolean
}

export type ResolvePageDesignPlanningContextOptions = {
  /** 仅 e2e/脚手架：投影为空时用本轮 description 兜底。生产 runner 勿传。 */
  fallbackDescription?: string
}

export type EnsurePageDesignBusinessOptions = {
  host: AiAgentHost
  getPageDesignEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
}

export type PageDesignPayloadGuideValidationResult = {
  ok: boolean
  matchedToolNames: string[]
  issue?: string
}

export function resolvePageDesignPlanningContext(
  project: ProjectModel,
  pageId: string,
  options: ResolvePageDesignPlanningContextOptions = {},
): Pick<PageDesignRunInput, 'effectiveDescription' | 'planningTitle' | 'planningPath'> {
  const summary = project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    throw new Error(`pageDesign: no planning projection for pageId "${pageId}".`)
  }
  let effectiveDescription = summary.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    const fallback = options.fallbackDescription?.trim() ?? ''
    if (fallback.length === 0) {
      throw new Error(
        `pageDesign: page "${pageId}" has empty effectiveDescription; set navigation description before AI run.`,
      )
    }
    effectiveDescription = fallback
  }
  const planningTitle = summary.title.trim()
  const planningPath = summary.path.trim()
  return {
    effectiveDescription,
    planningTitle: planningTitle.length > 0 ? planningTitle : pageId,
    planningPath: planningPath.length > 0 ? planningPath : `/${pageId}`,
  }
}

export function ensurePageDesignBusiness(options: EnsurePageDesignBusinessOptions): AiAgentHost {
  return options.host.ensure(PAGE_DESIGN_MODULE_ID, {
    moduleId: PAGE_DESIGN_MODULE_ID,
    create: () => AiModuleAdapter.createRegistration({
      moduleClass: ProjectModel,
      metadata: readPageDesignProjectMetadata(),
      options: {
        moduleId: PAGE_DESIGN_MODULE_ID,
        inputContract: createSimpleInputContract<PageDesignRunInput>({
          businessId: PAGE_DESIGN_MODULE_ID,
          identityField: 'pageId',
          messageField: 'description',
          paramsSchema: {
            type: 'object',
            properties: {
              pageId: { type: 'string' },
              description: { type: 'string' },
              effectiveDescription: { type: 'string' },
              planningTitle: { type: 'string' },
              planningPath: { type: 'string' },
              mode: { type: 'string', enum: ['create', 'update', 'fix'] },
              allowedOperations: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  nodeTree: { type: 'boolean' },
                  dataSet: { type: 'boolean' },
                  script: { type: 'boolean' },
                  style: { type: 'boolean' },
                  navigation: { type: 'boolean' },
                },
              },
              preserveExistingInteractions: { type: 'boolean' },
            },
            required: ['pageId', 'description', 'effectiveDescription'],
            additionalProperties: false,
          },
          systemPrompt: createPageDesignSystemPrompt,
          title: input => `pageDesign:${input.pageId}`,
          readonlySteps: [
            '策划约束已注入 effectiveDescription（来自 readPlanningProjection）；禁止从 navigationRoot 或菜单节点拼接需求。',
            '先查询 ProjectModel 能力边界，再通过 openPageDesign(pageId) 进入 ConfigPageNode。',
            '复杂参数先 queryPayloads / guidePayload，结构改写优先 module_script。',
          ],
        }),
        resolveInstance: ctx => resolvePageDesignProject(options, ctx),
        ...(pageDesignRuntimeMetadataDocument.$defs === undefined
          ? {}
          : { jsonSchemaDefs: pageDesignRuntimeMetadataDocument.$defs }),
      },
    }),
  })
}

export function validatePageDesignPayloadGuidesFromSession(
  _files: unknown,
  sessionRecord: unknown,
): PageDesignPayloadGuideValidationResult {
  const matchedToolNames = collectToolNames(sessionRecord).filter(isPayloadGuideToolName)
  if (matchedToolNames.length > 0) {
    return { ok: true, matchedToolNames }
  }
  return {
    ok: false,
    matchedToolNames,
    issue: 'session did not record payload guide or payload query tool usage',
  }
}

function createPageDesignSystemPrompt(input: PageDesignRunInput): string {
  const effectiveDescription = input.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    throw new Error('pageDesign systemPrompt requires effectiveDescription from readPlanningProjection.')
  }
  const planningTitle = input.planningTitle?.trim() ?? input.pageId
  const planningPath = input.planningPath?.trim() ?? `/${input.pageId}`
  return [
    `当前 pageDesign 页面: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
    '策划约束（readPlanningProjection.effectiveDescription，勿从 navigation 树拼接）:',
    effectiveDescription,
    `用户本轮目标: ${input.description}`,
    '导航提示: 根 kind 为 project；先 module_find({ path: "/", childKind: "project", query: { id: "<projectId>" } })，再 openPageDesign(pageId)。',
    '元数据来源: generated pageDesign module metadata + component payload catalog.',
    '执行原则: this 是当前 ProjectModel；openPageDesign(pageId) 进入 ConfigPageNode，再进入 node-tree / dataset / 四文件。',
  ].join('\n')
}

function resolvePageDesignProject(
  options: EnsurePageDesignBusinessOptions,
  ctx: AiModulePathContext,
): ProjectModel {
  const moduleInstanceId = ctx.host?.moduleInstanceId
  if (moduleInstanceId === undefined || moduleInstanceId.trim().length === 0) {
    throw new Error('pageDesign ProjectModel requires host.moduleInstanceId.')
  }
  const host = options.getPageDesignEditor({ moduleInstanceId })
  host.project.openPageDesign(moduleInstanceId)
  return host.project
}

function readPageDesignProjectMetadata(): AiModuleMetadataJson {
  const projectModule = pageDesignRuntimeMetadataDocument.modules.find(
    module => module.rootApi.kind === 'project',
  )
  if (projectModule === undefined) {
    throw new Error('pageDesign runtime metadata missing ProjectModel rootApi.')
  }
  return resolveModuleMetadataJson(projectModule, {
    inlineSchemaRefs: false,
    ...(pageDesignRuntimeMetadataDocument.$defs === undefined
      ? {}
      : { schemaDefs: pageDesignRuntimeMetadataDocument.$defs }),
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectToolNames(value: unknown): string[] {
  const names: string[] = []
  const visited = new Set<unknown>()
  const visit = (current: unknown): void => {
    if (current === null || typeof current !== 'object') return
    if (visited.has(current)) return
    visited.add(current)
    if (Array.isArray(current)) {
      for (const item of current) visit(item)
      return
    }
    if (!isPlainObject(current)) return
    const toolName = current['toolName'] ?? current['name'] ?? current['functionName']
    if (typeof toolName === 'string') names.push(toolName)
    for (const item of Object.values(current)) visit(item)
  }
  visit(value)
  return [...new Set(names)]
}

function isPayloadGuideToolName(name: string): boolean {
  const normalized = name.toLowerCase()
  return normalized.includes('payload')
    || normalized.includes('guide')
    || normalized.includes('module_query')
    || normalized.includes('module_guide')
}
