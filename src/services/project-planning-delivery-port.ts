/**
 * @module app:services/project-planning-delivery-port
 * 职责：提供 projectPlanning 的 AI 交付端口，把 navigation dirty 状态保存或记录到统一 delivery 结果。
 * 边界：只处理 ProjectWorkspace navigation 交付，不进入 pageDesign 四文件链路，也不执行 AI 会话。
 * AI用途：排查 projectPlanning Host Run 后 navigation 为什么保存、跳过或回滚时，用本模块定位交付策略。
 */

import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiDeliveryArtifact,
  AiDeliveryPort,
} from '@/services/ai-delivery-port'

export type ProjectPlanningDeliveryContext = Readonly<{
  editor: ProjectWorkspace
  saveNavigationAfterRun: boolean
}>

export function createProjectPlanningHostRunDeliveryPort(): AiDeliveryPort<ProjectPlanningDeliveryContext> {
  return {
    mode: 'auto',
    async save(context) {
      const navigationDirty = context.editor.project.navigationDirty
      if (!context.saveNavigationAfterRun || !navigationDirty) {
        return {
          mode: 'auto',
          status: 'skipped',
          artifacts: navigationDirty ? [createNavigationArtifact('skipped')] : [],
        }
      }
      try {
        await context.editor.saveAll()
        return {
          mode: 'auto',
          status: 'saved',
          artifacts: [createNavigationArtifact('saved')],
        }
      } catch (error: unknown) {
        return {
          mode: 'auto',
          status: 'failed',
          artifacts: [createNavigationArtifact('dirty')],
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const navigationDirty = context.editor.project.navigationDirty
      return Promise.resolve({
        mode: 'auto',
        status: navigationDirty ? 'rolledBack' : 'skipped',
        artifacts: navigationDirty ? [createNavigationArtifact('rolledBack')] : [],
        message: error.message,
      })
    },
  }
}

function createNavigationArtifact(status: AiDeliveryArtifact['status']): AiDeliveryArtifact {
  return {
    kind: 'navigation',
    name: 'navigation',
    status,
  }
}
