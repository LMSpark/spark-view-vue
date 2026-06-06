/**
 * 已提交导航的统一同步 — 单次 DTO 灌入 committed ProjectModel，再投影到壳层 UI 与编辑宿主。
 *
 * 运行时侧栏读 committed ProjectModel 的 snapshot 投影；DevSystem 读 editable ProjectModel。
 */
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import { getNavTree, refreshRoutes } from '@spark-appworks/spark-app'
import { readAppProjectNavigationRoot, syncAppProjectModelFromNav } from '@/services/app-project-model'
import { syncAppProjectWorkspaceFromNav } from '@/services/project-workspace'

export type ShellNavRootListener = (navData: ProjectModelData | null) => void

let shellNavRootListener: ShellNavRootListener | null = null

/** App.vue 注册：将已提交导航写入 _navRoot（驱动 useNavigation）。 */
export function registerShellNavRootListener(listener: ShellNavRootListener): () => void {
  shellNavRootListener = listener
  return () => {
    if (shellNavRootListener === listener) {
      shellNavRootListener = null
    }
  }
}

function applyShellNavRoot(navData: ProjectModelData | null): void {
  shellNavRootListener?.(navData)
}

/** 将同一份已提交导航 DTO 同步到壳层 UI 与两个 ProjectModel 实例。 */
export function syncCommittedNavigation(navData: ProjectModelData | null): void {
  syncAppProjectModelFromNav(navData)
  applyShellNavRoot(readAppProjectNavigationRoot())
  syncAppProjectWorkspaceFromNav(navData)
}

/** 从路由缓存读取已提交导航并同步（无 HTTP）。 */
export function syncCommittedNavigationFromRouter(): void {
  syncCommittedNavigation(getNavTree())
}

/**
 * 刷新路由（单次 HTTP GET）并同步壳层 + 领域实例。
 * DevSystem 保存后应使用此函数，避免 editor.reloadNavigation 再 GET。
 */
export async function reloadAndSyncNavigation(): Promise<ProjectModelData | null> {
  const navTree = await refreshRoutes()
  syncCommittedNavigation(navTree)
  return navTree
}
