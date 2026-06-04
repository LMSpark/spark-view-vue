/**
 * APP 壳层 pageDesign Host Run provider。
 *
 * 这是 pageDesign 业务注册到通用 Host Run 分布式桥的装配层：它只创建
 * headless ProjectEditor、按请求 pageId 打开页面、确保业务注册，并在运行结束后
 * 保存 dirty 四文件。SPARK AI 内核仍不持有页面状态或业务编排。
 */

import type {
  AiAgentHost,
  AiAgentTaskChatOptions,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import { createProjectEditor, type ProjectEditor } from '@spark-appworks/spark-project-model/project'
import {
  ensurePageDesignBusiness,
  PAGE_DESIGN_MODULE_ID,
} from '@/services/page-design-business'
import { getNavApi, getPageApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { createAuthHeaders, http } from '@/services/http'
import type {
  AiHostRunTarget,
  AiHostRunPrepare,
} from '@/services/ai-host-run-bridge'

const pageDesignEditors = new Map<string, ProjectEditor>()

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
    getPageDesignEditor: (context) => {
      const editor = pageDesignEditors.get(context.moduleInstanceId)
      if (editor === undefined) {
        throw new Error(`Headless pageDesign editor is not prepared: ${context.moduleInstanceId}`)
      }
      return editor
    },
  })

  return createSavingPageDesignHost(pageDesignHost, pageId)
}

function createHeadlessPageDesignEditor(): ProjectEditor {
  return createProjectEditor({
    projectId: getUser()?.defaultProjectId ?? 'homepage',
    http,
    getPageFilesApi: getPageApi,
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
