import type { RendererSectionApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type RendererSectionZeroCodeOptions = {
  collapsed: ValueRef<boolean>
  collapsible: ValueRef<boolean>}

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