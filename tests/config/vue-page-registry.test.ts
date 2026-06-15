import { describe, expect, it } from 'vitest'

import {
  buildPreAuthNavTree,
  getVuePageEntry,
  getPublicPaths,
  getVuePageOptions,
  hasVuePage,
} from '@/registries/vue-page-registry'

describe('Vue page registry', () => {
  it('binds JSON page declarations to route metadata', () => {
    const publicPaths = getPublicPaths()
    const navTree = buildPreAuthNavTree()
    const options = getVuePageOptions()
    const homePage = getVuePageEntry('/')

    expect(homePage?.source).toBe('src/views/platform/HomePage.vue')
    expect(typeof homePage?.load).toBe('function')
    expect(hasVuePage('/about')).toBe(true)
    expect(hasVuePage('/missing')).toBe(false)
    expect(publicPaths.has('/login')).toBe(true)
    expect(publicPaths.has('/dashboard')).toBe(false)
    expect(navTree.homePath).toBe('/')
    expect(navTree.children.some(node => node.path === '/about')).toBe(true)
    expect(options.some(option => option.path === '/dev' && option.scope === 'app')).toBe(true)
    expect(options.some(option => option.path === '/workflow-designs' && option.source === 'src/views/app/WorkflowDesigns.vue')).toBe(true)
  })
})
