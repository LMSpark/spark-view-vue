import { mount } from '@vue/test-utils'
import { computed, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { NavNode, NavigationContext } from '@spark-view/spark-app'
import { NAV_KEY } from '@spark-view/spark-app'
import AppSidebar from '@/layout/AppSidebar.vue'

const ElMenuStub = defineComponent({
  name: 'ElMenu',
  props: {
    defaultActive: String,
  },
  setup(props, { slots, attrs }) {
    return () => h('ul', {
      ...attrs,
      class: 'el-menu',
      'data-default-active': props.defaultActive,
    }, slots['default']?.())
  },
})

const ElMenuItemStub = defineComponent({
  name: 'ElMenuItem',
  props: {
    index: String,
    disabled: Boolean,
  },
  setup(props, { slots, attrs }) {
    return () => h('li', {
      ...attrs,
      class: ['el-menu-item', attrs['class']],
      'data-index': props.index,
      'aria-disabled': String(props.disabled ?? false),
    }, slots['default']?.())
  },
})

const ElSubMenuStub = defineComponent({
  name: 'ElSubMenu',
  props: {
    index: String,
  },
  setup(props, { slots, attrs }) {
    return () => h('li', {
      ...attrs,
      class: 'el-sub-menu',
      'data-index': props.index,
    }, [
      h('div', { class: 'el-sub-menu__title' }, slots['title']?.()),
      h('ul', slots['default']?.()),
    ])
  },
})

const ElMenuItemGroupStub = defineComponent({
  name: 'ElMenuItemGroup',
  props: {
    title: String,
  },
  setup(props, { slots, attrs }) {
    return () => h('li', {
      ...attrs,
      class: 'el-menu-item-group',
      'data-title': props.title,
    }, [
      h('div', { class: 'el-menu-item-group__title' }, props.title),
      h('ul', slots['default']?.()),
    ])
  },
})

const NavIconStub = defineComponent({
  name: 'NavIcon',
  props: {
    name: String,
  },
  setup(props) {
    return () => h('span', { class: 'nav-icon-stub', 'data-icon': props.name })
  },
})

function createNavigationContext(activePath: NavNode[]): NavigationContext {
  const regionItems = computed(() => ({
    header: [],
    sidebar: [],
    toolbar: [],
    userMenu: [],
  }))
  return {
    activePath: computed(() => activePath),
    regionItems,
    regionVisibility: computed(() => ({
      header: false,
      sidebar: false,
      toolbar: false,
      userMenu: false,
    })),
    moduleContext: computed(() => null),
    navigateTo: vi.fn(),
    navigateToPath: vi.fn(),
    setContextValue: vi.fn(),
    isNodeActive: (node) => activePath.some((active) => active.id === node.id),
    getBadge: vi.fn(),
    setBadge: vi.fn(),
  }
}

describe('AppSidebar navigation rendering', () => {
  it('uses active nav node indexes for platform-prefixed routes and renders one divider', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/platform/dev', component: { template: '<div />' } }],
    })
    await router.push('/platform/dev')
    await router.isReady()

    const devCenter: NavNode = {
      id: 'platform-dev-center',
      nodeKind: 'module',
      title: '开发中心',
      childPlacement: 'sidebar',
    }
    const items: NavNode[] = [
      {
        id: 'platform-dbms',
        nodeKind: 'system-page',
        title: '数据库管理',
        icon: 'DataBase',
        path: '/dbms',
        dividerAfter: true,
      },
      {
        id: 'platform-dev',
        nodeKind: 'system-page',
        title: '开发工作台',
        icon: 'Lightning',
        path: '/dev',
      },
      {
        id: 'platform-cache',
        nodeKind: 'system-page',
        title: '缓存管理',
        icon: 'Coin',
        path: '/cache-manager',
      },
    ]
    const platformDev = items[1]
    if (platformDev === undefined) throw new Error('Expected platform dev nav item')
    const nav = createNavigationContext([devCenter, platformDev])

    const wrapper = mount(AppSidebar, {
      props: {
        items,
      },
      global: {
        plugins: [router],
        provide: {
          [NAV_KEY]: nav,
        },
        stubs: {
          ElMenu: ElMenuStub,
          ElMenuItem: ElMenuItemStub,
          ElSubMenu: ElSubMenuStub,
          ElMenuItemGroup: ElMenuItemGroupStub,
          NavIcon: NavIconStub,
        },
      },
    })

    expect(wrapper.find('.el-menu').attributes('data-default-active')).toBe('/dev')
    expect(wrapper.findAll('.app-sidebar__node-divider')).toHaveLength(1)
    expect(wrapper.find('.app-sidebar__menu-item--active').text()).toContain('开发工作台')
  })
})
