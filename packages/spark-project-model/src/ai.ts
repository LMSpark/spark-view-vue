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
import type { ProjectEditor } from './service/editor/project-editor.service'
import { ProjectModel } from './entity/project/project.entity'
import pageDesignModuleMetadata from './ai/page-design/page-design-module-metadata.runtime.generated.json'

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
  const modules = (pageDesignModuleMetadata as Readonly<{
    modules?: readonly AiModuleMetadataJson[]
  }>).modules ?? []
  const metadata = modules.find(module => module.rootApi.kind === 'project')
  if (metadata === undefined) {
    throw new Error('Generated pageDesign project metadata is missing. Run pnpm run generate:module-metadata.')
  }
  return metadata
}

export {
  componentTypesFromPageDesignRule,
  flattenPageDesignSparkNodes,
  parsePageDesignJsonFile,
} from './ai/page-design/support'

export type {
  PageDesignFileSnapshot,
} from './ai/page-design/support'

export {
  pageDesignServiceFailure,
} from './ai/page-design/service'

export type {
  PageDesignServiceActionBinding,
  PageDesignServiceContext,
  PageDesignServiceOptions,
  PageDesignServiceResult,
  PageDesignTextFileKey,
} from './ai/page-design/service'
