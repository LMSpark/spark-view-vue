import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import { resetAppProjectWorkspace } from '@/services/project-workspace'
import { readAppProjectNavigationRoot, resetAppProjectModel } from '@/services/app-project-model'

const navTreeState = vi.hoisted(() => ({
  tree: null as ProjectModelData | null,
  refreshCalls: 0,
}))

vi.mock('@spark-appworks/spark-app', () => ({
  getNavTree: vi.fn(() => navTreeState.tree),
  refreshRoutes: vi.fn(async () => {
    navTreeState.refreshCalls += 1
    return navTreeState.tree
  }),
}))

import { refreshRoutes } from '@spark-appworks/spark-app'
import {
  registerShellNavRootListener,
  reloadAndSyncNavigation,
  syncCommittedNavigation,
  syncCommittedNavigationFromRouter,
} from '@/services/navigation-sync'
import { getAppProjectWorkspace } from '@/services/project-workspace'

const sampleNav: ProjectModelData = {
  title: 'root',
  childPlacement: 'header',
  children: [
    { id: 'alpha-node', title: 'Alpha', nodeKind: 'page', path: '/alpha' },
  ],
}

describe('navigation-sync', () => {
  beforeEach(() => {
    resetAppProjectWorkspace()
    resetAppProjectModel()
    navTreeState.tree = { ...sampleNav, children: [...sampleNav.children!] }
    navTreeState.refreshCalls = 0
  })

  it('syncCommittedNavigation fans out to shell listener and editor.project', () => {
    const shellWrites: ProjectModelData[] = []
    const unregister = registerShellNavRootListener((nav) => {
      if (nav) shellWrites.push(nav)
    })

    syncCommittedNavigation(sampleNav)

    expect(shellWrites).toHaveLength(1)
    expect(shellWrites[0]?.children?.[0]?.id).toBe('alpha-node')
    expect(readAppProjectNavigationRoot()?.children[0]?.id).toBe('alpha-node')
    expect(getAppProjectWorkspace().project.readNavigationProjection().treeData[0]?.id).toBe('alpha-node')

    unregister()
  })

  it('syncCommittedNavigationFromRouter uses getNavTree without HTTP', () => {
    const shellWrites: ProjectModelData[] = []
    registerShellNavRootListener((nav) => {
      if (nav) shellWrites.push(nav)
    })

    syncCommittedNavigationFromRouter()

    expect(shellWrites).toHaveLength(1)
    expect(vi.mocked(refreshRoutes)).not.toHaveBeenCalled()
    expect(getAppProjectWorkspace().project.readNavigationProjection().treeData[0]?.id).toBe('alpha-node')
  })

  it('reloadAndSyncNavigation refreshes routes once then syncs', async () => {
    registerShellNavRootListener(() => {})

    await reloadAndSyncNavigation()

    expect(navTreeState.refreshCalls).toBe(1)
    expect(vi.mocked(refreshRoutes)).toHaveBeenCalledTimes(1)
    expect(getAppProjectWorkspace().project.readNavigationProjection().treeData[0]?.id).toBe('alpha-node')
  })
})
