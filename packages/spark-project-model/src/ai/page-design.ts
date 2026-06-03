/**
 * @spark-view/spark-project-model/ai
 *
 * AI-facing contracts that are implemented by the project editor package.
 */

import {
  AiModuleAdapter,
  createSimpleInputContract,
  type AiAgentHost,
} from '@spark-view/spark-ai/agent'
import type { AiModuleMetadataJson, AiModulePathContext } from '@spark-view/spark-ai/modules'
import type { ProjectEditor } from '../editor/editor'
import { ProjectModel } from '../core/project'
import pageDesignVcmMetadata from '../vcm/page-design/page-design-vcm-metadata.generated.json'

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
            '先用 module_query/module_guide 查询 generated metadata，禁止使用 page-design 硬编码能力表。',
            '能力实例是当前 ProjectModel；先通过 nodes.openConfigPage(pageId) 进入 ConfigPageNode，再进入页面配置子模型。',
            '复杂参数和复杂属性先查概要，再查局部指南，最后执行函数或 module_script。',
          ],
        }),
        resolveInstance: ctx => resolvePageDesignProject(options, ctx),
      },
    }),
  })
}

function createPageDesignSystemPrompt(input: PageDesignRunInput): string {
  return [
    `当前 pageDesign 页面实例: ${input.pageId}`,
    `用户目标: ${input.description}`,
    '元数据来源: VCM generated metadata from capability provider classes.',
    '执行原则: this 是当前 ProjectModel；先通过 this.nodes.openConfigPage({ pageId }) 获取页面配置节点，再按需进入 nodeTree、dataSet、script、style 子模块。',
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
  assertPageDesignVcmMetadata()
  return {
    schemaVersion: 1,
    rootApi: {
      kind: 'project',
      name: 'Page Design Project',
      description: '当前 pageDesign 项目模型。元数据来源于 VCM generated metadata；通过 openConfigPage(pageId) 进入配置页面节点。',
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
            '进入页面后优先使用 module_script 在返回对象上访问 rule、dataSet、script、style 子模型。',
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

function assertPageDesignVcmMetadata(): void {
  const metadata = pageDesignVcmMetadata as Readonly<{
    props?: ReadonlyArray<{ name?: string }>
  }>
  if (metadata.props?.some(prop => prop.name === 'ProjectModel') !== true) {
    throw new Error('Generated pageDesign VCM metadata is missing ProjectModel. Run pnpm run generate:module-metadata.')
  }
}
