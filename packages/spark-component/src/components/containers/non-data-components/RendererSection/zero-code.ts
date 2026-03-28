import type { RendererSectionApi } from './types'

interface ValueRef<T> {
  value: T
}

interface RendererSectionZeroCodeOptions {
  collapsed: ValueRef<boolean>
  collapsible: ValueRef<boolean>
}

export function createRendererSectionZeroCode(options: RendererSectionZeroCodeOptions) {
  function toggleCollapsed(): void {
    if (!options.collapsible.value) return
    options.collapsed.value = !options.collapsed.value
  }

  const sectionApi: RendererSectionApi = {
    isCollapsed() {
      return options.collapsed.value
    },
    setCollapsed(value) {
      options.collapsed.value = value
    },
    toggle() {
      options.collapsed.value = !options.collapsed.value
    },
  }

  return {
    sectionApi,
    handleHeaderClick: toggleCollapsed,
    toggleCollapsed,
  }
}