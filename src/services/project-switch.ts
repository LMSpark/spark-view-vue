/**
 * 项目切换服务 — provide/inject 键 + 类型定义。
 *
 * App.vue provide → 子组件 inject，用于切换当前项目后联动刷新导航 + 路由。
 */
import type { InjectionKey } from 'vue'

/** Project Switch Service 的语义模型。 */
export type ProjectSwitchService = {
  /** 切换到指定项目并刷新导航 + 路由 */
  switchAndReload(projectId: string): Promise<void>}

export const PROJECT_SWITCH_KEY: InjectionKey<ProjectSwitchService> = Symbol('project-switch')
