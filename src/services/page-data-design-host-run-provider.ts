/**
 * @module app:services/page-data-design-host-run-provider
 * 职责：pageDataDesign Host Run provider，headless 运行后 selective save pagedata.json。
 * 边界：与 pageDesign Host Run 共用 editor 工厂，但 alias 与交付策略独立。
 * AI用途：排查 SSE pageDataDesign Host Run 准备 editor 或单文件落盘时，用本模块定位 provider。
 */
import type {
  AiAgentHost,
  AiAgentHostRunResult,
  AiAgentTaskChatOptions,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  ensurePageDataDesignBusiness,
  PAGE_DATA_DESIGN_MODULE_ID,
} from '@/services/page-data-design-business'
import {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
} from '@/services/page-design-editor-provider'
import type {
  AiHostRunPrepare,
  AiHostRunTarget,
} from '@/services/ai-host-run-bridge'
import {
  attachAiDeliveryResult,
  createAiDeliveryFailureError,
  createAiDeliveryResultExtras,
  toError,
} from '@/services/ai-delivery-port'
import { createPageDataDesignHostRunDeliveryPort } from '@/services/page-data-design-delivery-port'

const pageDataDesignEditors = new Map<string, ProjectWorkspace>()

export const preparePageDataDesignHostRun: AiHostRunPrepare<AiAgentHost> = async (event, host) => {
  if (event.alias !== PAGE_DATA_DESIGN_MODULE_ID) return host

  const pageId = readPageDataDesignPageId(event.args)
  if (pageId !== null) {
    const editor = createHeadlessPageDesignEditor()
    await editor.selectPage(pageId, { forceReload: true })
    pageDataDesignEditors.set(pageId, editor)
  }

  const pageDataDesignHost = ensurePageDataDesignBusiness({
    host,
    getPageDataDesignEditor: createPageDesignEditorGetter(pageDataDesignEditors),
  })

  return createSavingPageDataDesignHost(pageDataDesignHost, pageId)
}

function createSavingPageDataDesignHost(
  host: AiHostRunTarget,
  pageId: string | null,
): AiHostRunTarget {
  const delivery = createPageDataDesignHostRunDeliveryPort()
  return {
    has(alias) {
      return host.has(alias)
    },
    dryRun(alias, args) {
      return host.dryRun(alias, args)
    },
    async run(
      alias: string,
      args: AiJsonParams,
      chat?: AiAgentTaskChatOptions,
    ): Promise<AiAgentHostRunResult> {
      const editor = pageId === null ? undefined : pageDataDesignEditors.get(pageId)
      try {
        let result: AiAgentHostRunResult
        try {
          result = await host.run(alias, args, chat)
        } catch (error: unknown) {
          if (editor === undefined || pageId === null) throw error
          const normalizedError = toError(error)
          const deliveryContext = { editor, pageId }
          const deliveryResult = await delivery.rollback(deliveryContext, normalizedError)
          await delivery.trace(deliveryContext, deliveryResult)
          throw attachAiDeliveryResult(normalizedError, deliveryResult)
        }

        if (editor === undefined || pageId === null) return result
        const deliveryContext = { editor, pageId }
        const deliveryResult = await delivery.save(deliveryContext)
        await delivery.trace(deliveryContext, deliveryResult)
        if (deliveryResult.status === 'failed') {
          throw createAiDeliveryFailureError(
            deliveryResult.message ?? 'pageDataDesign Host Run delivery failed.',
            deliveryResult,
          )
        }
        return {
          ...result,
          resultExtras: {
            ...(result.resultExtras ?? {}),
            ...createAiDeliveryResultExtras(deliveryResult),
          },
        }
      } finally {
        if (pageId !== null) {
          pageDataDesignEditors.delete(pageId)
        }
      }
    },
  }
}

function readPageDataDesignPageId(args: Record<string, unknown>): string | null {
  const pageId = args['pageId']
  if (typeof pageId !== 'string') return null
  const normalized = pageId.trim()
  return normalized.length > 0 ? normalized : null
}
