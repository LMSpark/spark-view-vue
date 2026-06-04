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
import { ProjectModel } from '@spark-appworks/spark-project-model'
import type { ProjectEditor } from '@spark-appworks/spark-project-model/project'

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
  mode?: PageDesignRunMode
  allowedOperations?: PageDesignAllowedOperations
  preserveExistingInteractions?: boolean
}

export type EnsurePageDesignBusinessOptions = {
  host: AiAgentHost
  getPageDesignEditor: (context: { moduleInstanceId: string }) => ProjectEditor
}

export type PageDesignPayloadGuideValidationResult = {
  ok: boolean
  matchedToolNames: string[]
  issue?: string
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
            required: ['pageId', 'description'],
            additionalProperties: false,
          },
          systemPrompt: createPageDesignSystemPrompt,
          title: input => `pageDesign:${input.pageId}`,
          readonlySteps: [
            '先查询当前 ProjectModel 能力边界，再打开目标配置页。',
            '能力实例是当前 ProjectModel；先通过 openConfigPage(pageId) 进入 ConfigPageNode，再进入页面配置子模型。',
            '复杂参数和复杂属性先查概要，再查局部指南，最后执行函数或 module_script。',
          ],
        }),
        resolveInstance: ctx => resolvePageDesignProject(options, ctx),
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
  return [
    `当前 pageDesign 页面实例: ${input.pageId}`,
    `用户目标: ${input.description}`,
    '元数据来源: app-layer pageDesign registration.',
    '执行原则: this 是当前 ProjectModel；先通过 this.openConfigPage(pageId) 获取页面配置节点，再按需进入 rule、dataSet、script、style 子模型。',
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
  const editor = options.getPageDesignEditor({ moduleInstanceId })
  editor.project.openConfigPage(moduleInstanceId)
  return editor.project
}

function readPageDesignProjectMetadata(): AiModuleMetadataJson {
  return {
    schemaVersion: 1,
    rootApi: {
      kind: 'project',
      name: 'Page Design Project',
      description: '当前 pageDesign 项目模型；通过 openConfigPage(pageId) 进入配置页面节点。',
      actions: [
        {
          name: 'openConfigPage',
          methodName: 'openConfigPage',
          description: '按 pageId 获取或实例化配置页面节点。',
          takesContext: false,
          paramsSchema: {
            type: 'object',
            properties: {
              pageId: { type: 'string' },
            },
            required: ['pageId'],
            additionalProperties: false,
          },
          resultSchema: {
            type: 'object',
            properties: {
              pageId: { type: 'string' },
            },
          },
          usageRules: [
            'pageId 必须来自输入，不允许从当前活动页兜底。',
            '进入页面后优先访问 rule、dataSet、script、style 子模型。',
          ],
        },
      ],
      attributes: [
        {
          name: 'projectId',
          description: '当前项目 ID。',
          schema: { type: 'string' },
          readable: true,
          writable: false,
        },
      ],
    },
  }
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
    const record = current as Record<string, unknown>
    const toolName = record['toolName'] ?? record['name'] ?? record['functionName']
    if (typeof toolName === 'string') names.push(toolName)
    for (const item of Object.values(record)) visit(item)
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
