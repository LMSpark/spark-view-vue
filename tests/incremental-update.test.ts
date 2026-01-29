// tests/incremental-update.test.ts

import { describe, it, expect, vi } from 'vitest'
import { SparkComponentRendererImpl } from '@spark-view/spark-core'
import type { SparkComponentConfig, SparkComponentContext } from '@spark-view/spark-core'

// Mock logger
vi.mock('../features/spark/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

// Mock component registry
vi.mock('../features/spark/utils/SparkComponentRegistry', () => ({
  globalComponentRegistry: {
    get: vi.fn((type: string) => ({
      name: type,
      version: '1.0.0',
      component: vi.fn(),
      validateConfig: vi.fn(() => true)
    }))
  }
}))

describe('Incremental Update', () => {
  it('should detect when components need updating', () => {
    const renderer = new SparkComponentRendererImpl()

    const oldConfig: SparkComponentConfig = {
      type: 'test-component',
      props: { value: 1 },
      children: [{ type: 'child', props: { name: 'child1' } }]
    }

    const newConfig: SparkComponentConfig = {
      type: 'test-component',
      props: { value: 2 }, // changed
      children: [{ type: 'child', props: { name: 'child1' } }]
    }

    // Should detect that update is needed due to props change
    expect(renderer['shouldUpdateComponent'](oldConfig, newConfig)).toBe(true)
  })

  it('should not update when configs are identical', () => {
    const renderer = new SparkComponentRendererImpl()

    const config: SparkComponentConfig = {
      type: 'test-component',
      props: { value: 1 },
      children: [{ type: 'child', props: { name: 'child1' } }]
    }

    // Should not update when configs are the same reference
    expect(renderer['shouldUpdateComponent'](config, config)).toBe(false)
  })

  it('should detect children changes', () => {
    const renderer = new SparkComponentRendererImpl()

    const oldConfig: SparkComponentConfig = {
      type: 'test-component',
      children: [{ type: 'child', props: { name: 'child1' } }]
    }

    const newConfig: SparkComponentConfig = {
      type: 'test-component',
      children: [
        { type: 'child', props: { name: 'child1' } },
        { type: 'child', props: { name: 'child2' } } // added
      ]
    }

    // Should detect that children changed
    expect(renderer['haveChildrenChanged'](oldConfig.children || [], newConfig.children || [])).toBe(true)
  })

  it('should handle empty children arrays', () => {
    const renderer = new SparkComponentRendererImpl()

    const oldChildren: SparkComponentConfig[] = []
    const newChildren: SparkComponentConfig[] = []

    // Should not detect changes for empty arrays
    expect(renderer['haveChildrenChanged'](oldChildren, newChildren)).toBe(false)
  })
})