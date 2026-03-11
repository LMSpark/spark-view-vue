import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RouteLocationNormalizedGeneric } from 'vue-router'

export interface TabPage {
  /** 路由完整路径（唯一标识） */
  path: string
  /** 显示标题 */
  title: string
  /** 图标（来自 route.meta.icon） */
  icon?: string
  /** 路由 name */
  name?: string
  /** 可否关闭（首页默认不可关闭） */
  closable: boolean
  /** 完整路由信息快照 */
  fullPath: string
}

export type PageMode = 'single' | 'multi'

const _tabs = ref<TabPage[]>([])
const _activeTab = ref('')
const _mode = ref<PageMode>('multi')

/** 是否已初始化（避免多组件重复 watch） */
let _watchInstalled = false

function toTab(route: RouteLocationNormalizedGeneric): TabPage | null {
  const title = route.meta['title'] as string | undefined
  if (!title) return null
  const icon = route.meta['icon'] as string | undefined
  const name = route.name as string | undefined
  return {
    path: route.path,
    title,
    ...(icon !== undefined ? { icon } : {}),
    ...(name !== undefined ? { name } : {}),
    closable: route.path !== '/dashboard',
    fullPath: route.fullPath,
  }
}

export function useTabPages() {
  const route = useRoute()
  const router = useRouter()

  // 只安装一次 route watcher
  if (!_watchInstalled) {
    _watchInstalled = true
    watch(
      () => route.fullPath,
      () => {
        const tab = toTab(route)
        if (!tab) return
        _activeTab.value = tab.path
        const idx = _tabs.value.findIndex(t => t.path === tab.path)
        if (idx === -1) {
          _tabs.value.push(tab)
        } else {
          // 更新 fullPath（query/hash 可能变化）
          const existing = _tabs.value[idx]
          if (existing) existing.fullPath = tab.fullPath
        }
      },
      { immediate: true },
    )
  }

  function closeTab(path: string) {
    const idx = _tabs.value.findIndex(t => t.path === path)
    if (idx === -1) return
    const tab = _tabs.value[idx]
    if (!tab?.closable) return

    _tabs.value.splice(idx, 1)

    // 如果关闭的是当前激活页，跳转到相邻页
    if (_activeTab.value === path) {
      const next = _tabs.value[Math.min(idx, _tabs.value.length - 1)]
      if (next) {
        void router.push(next.fullPath)
      }
    }
  }

  function closeOthers(path: string) {
    _tabs.value = _tabs.value.filter(t => t.path === path || !t.closable)
    if (!_tabs.value.some(t => t.path === _activeTab.value)) {
      const target = _tabs.value.find(t => t.path === path) ?? _tabs.value[0]
      if (target) {
        void router.push(target.fullPath)
      }
    }
  }

  function closeAll() {
    _tabs.value = _tabs.value.filter(t => !t.closable)
    const target = _tabs.value[0]
    if (target) {
      void router.push(target.fullPath)
    }
  }

  function switchTo(path: string) {
    const tab = _tabs.value.find(t => t.path === path)
    if (tab) {
      void router.push(tab.fullPath)
    }
  }

  function setMode(mode: PageMode) {
    _mode.value = mode
    if (mode === 'single') {
      // 单页模式：仅保留当前激活页 + 不可关闭页
      _tabs.value = _tabs.value.filter(t => t.path === _activeTab.value || !t.closable)
    }
  }

  return {
    tabs: _tabs,
    activeTab: _activeTab,
    mode: _mode,
    closeTab,
    closeOthers,
    closeAll,
    switchTo,
    setMode,
  }
}
