/**
 * @module app:services/page-data-design-delivery-port
 * 职责：pageDataDesign 交付端口，只 commit pagedata.json（单文件 selective save）。
 * 边界：不保存 rule/nodeTree/script/style，也不处理 navigation。
 * AI用途：排查 pageDataDesign Host Run 为何只落盘 pagedata.json 或跳过保存时，用本模块定位交付策略。
 */

import type { PageNodeFileName, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiDeliveryArtifact,
  AiDeliveryMode,
  AiDeliveryPort,
} from '@/services/ai-delivery-port'

const PAGE_DATA_FILE_NAME = 'pagedata.json' satisfies PageNodeFileName

export type PageDataDesignDeliveryContext = Readonly<{
  editor: ProjectWorkspace
  pageId: string
}>

export function createPageDataDesignHostRunDeliveryPort(): AiDeliveryPort<PageDataDesignDeliveryContext> {
  return createPageDataDesignDeliveryPort({
    mode: 'auto',
    shouldSave: true,
    rollbackStatus: 'rolledBack',
  })
}

function createPageDataDesignDeliveryPort(options: Readonly<{
  mode: AiDeliveryMode
  shouldSave: boolean
  rollbackStatus: 'skipped' | 'rolledBack'
}>): AiDeliveryPort<PageDataDesignDeliveryContext> {
  return {
    mode: options.mode,
    async save(context) {
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      const pageDataDirty = dirtyFileNames.includes(PAGE_DATA_FILE_NAME)
      if (!options.shouldSave || !pageDataDirty) {
        return {
          mode: options.mode,
          status: 'skipped',
          artifacts: createPageDataArtifacts(
            pageDataDirty ? 'dirty' : 'skipped',
          ),
        }
      }
      try {
        await context.editor.savePageFile(PAGE_DATA_FILE_NAME)
        return {
          mode: options.mode,
          status: 'saved',
          artifacts: createPageDataArtifacts('saved'),
        }
      } catch (error: unknown) {
        return {
          mode: options.mode,
          status: 'failed',
          artifacts: createPageDataArtifacts('dirty'),
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      const pageDataDirty = dirtyFileNames.includes(PAGE_DATA_FILE_NAME)
      return Promise.resolve({
        mode: options.mode,
        status: pageDataDirty ? options.rollbackStatus : 'skipped',
        artifacts: createPageDataArtifacts(
          pageDataDirty
            ? (options.rollbackStatus === 'rolledBack' ? 'rolledBack' : 'dirty')
            : 'skipped',
        ),
        message: error.message,
      })
    },
  }
}

function readDirtyPageFileNames(editor: ProjectWorkspace): PageNodeFileName[] {
  return Array.from(editor.project.readDirtyProjection().dirtyFiles)
}

function createPageDataArtifacts(
  status: AiDeliveryArtifact['status'],
): readonly AiDeliveryArtifact[] {
  return [{
    kind: 'page-file',
    name: PAGE_DATA_FILE_NAME,
    status,
  }]
}
