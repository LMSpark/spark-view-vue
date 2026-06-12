/**
 * @module app:services/page-design-delivery-port
 * 职责：提供 pageDesign 的 AI 交付端口，把页面四文件 dirty 状态保存或记录到统一 delivery 结果。
 * 边界：只处理 ProjectWorkspace 的页面四文件交付，不负责注册 pageDesign 业务，也不执行 AI 会话。
 * AI用途：排查 pageDesign Host Run 或 DevSystem 内联运行后四文件为何保存、跳过或回滚时，用本模块定位交付策略。
 */

import type { PageNodeFileName, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiDeliveryArtifact,
  AiDeliveryMode,
  AiDeliveryPort,
} from '@/services/ai-delivery-port'

export type PageDesignDeliveryContext = Readonly<{
  editor: ProjectWorkspace
  pageId: string
}>

export function createPageDesignInlineDeliveryPort(options: Readonly<{
  autoSave: boolean
}>): AiDeliveryPort<PageDesignDeliveryContext> {
  const mode: AiDeliveryMode = options.autoSave ? 'auto' : 'manual'
  return createPageDesignDeliveryPort({
    mode,
    shouldSave: options.autoSave,
    rollbackStatus: 'skipped',
  })
}

export function createPageDesignHostRunDeliveryPort(): AiDeliveryPort<PageDesignDeliveryContext> {
  return createPageDesignDeliveryPort({
    mode: 'auto',
    shouldSave: true,
    rollbackStatus: 'rolledBack',
  })
}

function createPageDesignDeliveryPort(options: Readonly<{
  mode: AiDeliveryMode
  shouldSave: boolean
  rollbackStatus: 'skipped' | 'rolledBack'
}>): AiDeliveryPort<PageDesignDeliveryContext> {
  return {
    mode: options.mode,
    async save(context) {
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      if (!options.shouldSave || dirtyFileNames.length === 0) {
        return {
          mode: options.mode,
          status: 'skipped',
          artifacts: createPageFileArtifacts(dirtyFileNames, options.shouldSave ? 'skipped' : 'dirty'),
        }
      }
      try {
        await context.editor.saveDirtyPageFiles()
        return {
          mode: options.mode,
          status: 'saved',
          artifacts: createPageFileArtifacts(dirtyFileNames, 'saved'),
        }
      } catch (error: unknown) {
        return {
          mode: options.mode,
          status: 'failed',
          artifacts: createPageFileArtifacts(dirtyFileNames, 'dirty'),
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      return Promise.resolve({
        mode: options.mode,
        status: options.rollbackStatus,
        artifacts: createPageFileArtifacts(
          dirtyFileNames,
          options.rollbackStatus === 'rolledBack' ? 'rolledBack' : 'dirty',
        ),
        message: error.message,
      })
    },
  }
}

function readDirtyPageFileNames(editor: ProjectWorkspace): PageNodeFileName[] {
  return Array.from(editor.project.readDirtyProjection().dirtyFiles)
}

function createPageFileArtifacts(
  fileNames: readonly PageNodeFileName[],
  status: AiDeliveryArtifact['status'],
): readonly AiDeliveryArtifact[] {
  return fileNames.map(name => ({
    kind: 'page-file',
    name,
    status,
  }))
}
