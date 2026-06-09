/**
 * APP 壳层 projectPlanning Host Run provider（隔离式门面实例）。
 *
 * 无 UI：SSE / 后端下发 ai-host-run-request 时，按 projectId 准备 headless
 * ProjectWorkspace，运行结束可选保存 navigation 后丢弃，不污染 DevSystem session。
 */

import type {
  AiAgentHost,
  AiAgentHostRunResult,
  AiAgentTaskChatOptions,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiHostRunPrepare,
  AiHostRunTarget,
} from '@/services/ai-host-run-bridge'
import {
  createHeadlessProjectPlanningEditor,
  createProjectPlanningEditorGetter,
} from '@/services/project-planning-editor-provider'
import {
  ensureProjectPlanningBusiness,
  PROJECT_PLANNING_MODULE_ID,
} from '@/services/project-planning-business'

const projectPlanningEditors = new Map<string, ProjectWorkspace>()

export const prepareProjectPlanningHostRun: AiHostRunPrepare<AiAgentHost> = async (event, host) => {
  if (event.alias !== PROJECT_PLANNING_MODULE_ID) return host

  const projectId = readProjectPlanningProjectId(event.args)
  if (projectId !== null) {
    const editor = createHeadlessProjectPlanningEditor(projectId)
    await editor.loadNavigation()
    projectPlanningEditors.set(projectId, editor)
  }

  const projectPlanningHost = ensureProjectPlanningBusiness({
    host,
    getProjectPlanningEditor: createProjectPlanningEditorGetter(projectPlanningEditors),
  })

  return createSavingProjectPlanningHost(projectPlanningHost, projectId)
}

function createSavingProjectPlanningHost(
  host: AiHostRunTarget,
  projectId: string | null,
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
      const editor = projectId === null ? undefined : projectPlanningEditors.get(projectId)
      try {
        return await host.run(alias, args, chat)
      } finally {
        if (editor?.project.navigationDirty === true) {
          await editor.saveAll()
        }
        if (projectId !== null) {
          projectPlanningEditors.delete(projectId)
        }
      }
    },
  }
}

function readProjectPlanningProjectId(args: Record<string, unknown>): string | null {
  const projectId = args['projectId']
  if (typeof projectId !== 'string') return null
  const normalized = projectId.trim()
  return normalized.length > 0 ? normalized : null
}
