import { describe, it, expect, beforeEach } from 'vitest'
import { globalComponentRegistry } from '../src/utils/componentRegistry'

describe('componentRegistry', () => {
  beforeEach(() => {
    // Type-level reset not exposed; register with unique type to avoid cross-test interference
  })

  it('registers and retrieves a component', () => {
    const fake = {} as any
    globalComponentRegistry.register('test-type-1', fake as any)
    expect(globalComponentRegistry.get('test-type-1')?.component).toBe(fake)
    const types = globalComponentRegistry.getAllTypes()
    expect(types).toContain('test-type-1')
  })
})