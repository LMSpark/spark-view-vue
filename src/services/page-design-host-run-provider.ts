/**
 * @module app:services/page-design-host-run-provider
 * 职责：提供应用运行时 service 层的 page design host run provider 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * APP 壳层 pageDesign Host Run provider（隔离式门面实例）。
 *
 * 与 DevSystem 面板内 AI（共用当前编辑 scope 的 `editor.project`）不同：
 * Host Run / SSE 为无 UI 会话、可并发多 pageId，故每次 run 创建 headless
 * 独立 `ProjectWorkspace`，运行结束保存 dirty 四文件后丢弃，不污染 DevSystem 编辑 session。
 */

import type {
  AiAgentHost,
  AiAgentTaskChatOptions,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  ensurePageDesignBusiness,
  PAGE_DESIGN_MODULE_ID,
} from '@/services/page-design-business'
import {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
} from '@/services/page-design-editor-provider'
import type {
  AiHostRunTarget,
  AiHostRunPrepare,
} from '@/services/ai-host-run-bridge'

const pageDesignEditors = new Map<string, ProjectWorkspace>()

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
    getPageDesignEditor: createPageDesignEditorGetter(pageDesignEditors),
  })

  return createSavingPageDesignHost(pageDesignHost, pageId)
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
