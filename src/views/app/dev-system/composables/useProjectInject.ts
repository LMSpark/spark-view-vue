/**
 * DevWorkbench 项目 API 的 provide/inject 辅助
 *
 * DevWorkbench provide → 子编辑器 inject，避免 prop drilling。
 */
import { inject, provide, type InjectionKey } from 'vue'
import type { ProjectAPI } from './useProjectState'

export const PROJECT_KEY: InjectionKey<ProjectAPI> = Symbol('dev-project')

export function provideProject(api: ProjectAPI) {
  provide(PROJECT_KEY, api)
}

export function useProject(): ProjectAPI {
  const api = inject(PROJECT_KEY)
  if (!api) throw new Error('[useProject] must be used inside DevWorkbench (PROJECT_KEY not provided)')
  return api
}
