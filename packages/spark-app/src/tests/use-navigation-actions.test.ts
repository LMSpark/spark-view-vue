import { mount } from '@vue/test-utils'
import { defineComponent, reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { AppNavRoot, NavNode } from '../navigation/nav-model'
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

    const actionNode: NavNode = {
      id: 'settings-action',
      title: 'Settings',
      nodeKind: 'system-action',
      path: 'settings',
    }
    const navRoot = reactive<AppNavRoot>({
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
})
