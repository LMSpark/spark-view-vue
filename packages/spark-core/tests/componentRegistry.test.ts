import { describe, it, expect, beforeEach } from 'vitest'
import { componentRegistry } from '../src/utils/SparkComponentRegistry'

describe('componentRegistry', () => {
  beforeEach(() => {
    // Type-level reset not exposed; register with unique type to avoid cross-test interference
  })

  it('registers and retrieves a component', () => {
    const fake = {} as any
    componentRegistry.register('test-type-1', { type: 'test-type-1', name: 'test-type-1', version: '1.0.0', component: fake })
    expect(componentRegistry.get('test-type-1')?.component).toBe(fake)
    const types = componentRegistry.getAllTypes()
    expect(types).toContain('test-type-1')
  })
})