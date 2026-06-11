/**
 * @module app:services/project-switch
 * 职责：提供应用运行时 service 层的 project switch 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
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
