/**
 * 已提交导航的统一同步 — 单次 DTO fan-out 到壳层 UI 与领域实例。
 *
 * 运行时侧栏读 _navRoot（已提交）；DevSystem 读 readSnapshot()（可 dirty）。
 */
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import { getNavTree, refreshRoutes } from '@spark-appworks/spark-app'
import { syncAppProjectEditorFromNav } from '@/services/project-editor-host'

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

/** 将同一份已提交导航 DTO 同步到壳层 UI 与 editor.project。 */
export function syncCommittedNavigation(navData: ProjectModelData | null): void {
  applyShellNavRoot(navData)
  syncAppProjectEditorFromNav(navData)
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
