/**
 * APP 壳层 pageDesign Host Run provider。
 *
 * 这是 pageDesign 业务注册到通用 Host Run 分布式桥的装配层：它只创建
 * headless PageEditor、按请求 pageId 打开页面、确保业务注册，并在运行结束后
 * 保存 dirty 四文件。SPARK AI 内核仍不持有页面状态或业务编排。
 */

import type {
  AiAgentHost,
  AiAgentTaskChatOptions,
  AiAgentHostRunResult,
} from '@spark-view/spark-ai/agent'
import type { AiJsonParams } from '@spark-view/spark-ai/json'
import { createPageEditor, type PageEditor } from '@spark-view/spark-page-config/editor'
import {
  ensurePageDesignBusiness,
  PAGE_DESIGN_MODULE_ID,
} from '@spark-view/spark-page-config/ai'
import { getNavApi, getPageApi } from '@/services/api-paths'
import { createAuthHeaders, http } from '@/services/http'
import type {
  AiHostRunTarget,
  AiHostRunPrepare,
} from '@/services/ai-host-run-bridge'

const pageDesignEditors = new Map<string, PageEditor>()

export const preparePageDesignHostRun: AiHostRunPrepare<AiAgentHost> = async (event, host) => {
  if (event.alias !== PAGE_DESIGN_MODULE_ID) return host

  const pageId = readPageDesignPageId(event.args)
  if (pageId !== null) {
    const editor = createHeadlessPageDesignEditor()
    await editor.selectPage(pageId, { forceReload: true })
    pageDesignEditors.set(pageId, editor)
  }

  const pageDesignHost = ensurePageDesignBusiness({
    host,
    getPageDesignEditHost: (context) => {
      const editor = pageDesignEditors.get(context.moduleInstanceId)
      if (editor === undefined) {
        throw new Error(`Headless pageDesign editor is not prepared: ${context.moduleInstanceId}`)
      }
      return editor.createPageDesignEditHost({ pageId: context.moduleInstanceId })
    },
  })

  return createSavingPageDesignHost(pageDesignHost, pageId)
}

function createHeadlessPageDesignEditor(): PageEditor {
  return createPageEditor({
    http,
    getPageConfigApi: getPageApi,
    getNavigationApi: getNavApi,
    getHeaders: createAuthHeaders,
  })
}

function createSavingPageDesignHost(
  host: AiHostRunTarget,
  pageId: string | null,
): AiHostRunTarget {
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
      const editor = pageId === null ? undefined : pageDesignEditors.get(pageId)
      try {
        return await host.run(alias, args, chat)
      } finally {
        if (editor !== undefined) {
          await editor.saveDirtyPageFiles()
        }
        if (pageId !== null) {
          pageDesignEditors.delete(pageId)
        }
      }
    },
  }
}

function readPageDesignPageId(args: Record<string, unknown>): string | null {
  const pageId = args['pageId']
  if (typeof pageId !== 'string') return null
  const normalized = pageId.trim()
  return normalized.length > 0 ? normalized : null
}
