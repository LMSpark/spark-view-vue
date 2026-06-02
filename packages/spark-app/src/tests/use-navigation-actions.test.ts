import { mount } from '@vue/test-utils'
import { defineComponent, reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectModelData, ProjectNodeData } from '@spark-view/spark-project-model'
import type { NavigationContext } from '../navigation/nav-types'
import { useNavigation } from '../navigation/useNavigation'
import { createNavigationActionRegistry } from '../navigation/action-registry'

describe('useNavigation system-action handling', () => {
  it('executes action commands without pushing unmatched routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    await router.isReady()

    const actionNode: ProjectNodeData = {
      id: 'settings-action',
      title: 'Settings',
      nodeKind: 'system-action',
      path: 'settings',
    }
    const navRoot = reactive<ProjectModelData>({
      title: '',
      childPlacement: 'header',
      children: [actionNode],
    })
    const registry = createNavigationActionRegistry()
    const handler = vi.fn()
    registry.register('settings', handler)

    const navigationContext: { value?: NavigationContext } = {}
    const Harness = defineComponent({
      setup() {
        navigationContext.value = useNavigation(navRoot, { actionRegistry: registry })
        return () => null
      },
    })

    const push = vi.spyOn(router, 'push')
    mount(Harness, { global: { plugins: [router] } })

    const nav = navigationContext.value
    if (nav === undefined) {
      throw new Error('Navigation context was not initialized')
    }
    nav.navigateTo(actionNode)
    await Promise.resolve()

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ command: 'settings', node: actionNode }))
    expect(push).not.toHaveBeenCalled()
  })

  it('keeps the first sidebar projection when a deeper active node also resolves to sidebar', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/dev', component: { template: '<div />' } },
        { path: '/dbms', component: { template: '<div />' } },
        { path: '/cache-manager', component: { template: '<div />' } },
        { path: '/settings', component: { template: '<div />' } },
        { path: '/page-manager', component: { template: '<div />' } },
      ],
    })
    await router.push('/settings')
    await router.isReady()

    const navRoot = reactive<ProjectModelData>({
      title: '',
      childPlacement: 'header',
      children: [
        {
          id: 'dev-center',
          nodeKind: 'module',
          title: '开发中心',
          childPlacement: 'sidebar',
          children: [
            { id: 'dev', nodeKind: 'system-page', title: '开发工作台', path: '/dev' },
            { id: 'dbms', nodeKind: 'system-page', title: '数据库管理', path: '/dbms' },
            { id: 'cache', nodeKind: 'system-page', title: '缓存管理', path: '/cache-manager' },
            {
              id: 'system-config',
              nodeKind: 'module',
              title: '系统配置',
              childPlacement: 'sidebar',
              children: [
                { id: 'settings', nodeKind: 'system-page', title: '系统设置', path: '/settings' },
                { id: 'page-manager', nodeKind: 'system-page', title: '页面管理', path: '/page-manager' },
              ],
            },
          ],
        },
      ],
    })

    const navigationContext: { value?: NavigationContext } = {}
    const Harness = defineComponent({
      setup() {
        navigationContext.value = useNavigation(navRoot)
        return () => null
      },
    })

    mount(Harness, { global: { plugins: [router] } })

    const nav = navigationContext.value
    if (nav === undefined) {
      throw new Error('Navigation context was not initialized')
    }

    expect(nav.regionItems.value.sidebar.map((node) => node.title)).toEqual([
      '开发工作台',
      '数据库管理',
      '缓存管理',
      '系统配置',
    ])
  })
})
