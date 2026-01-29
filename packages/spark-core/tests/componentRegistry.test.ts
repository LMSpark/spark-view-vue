import { describe, it, expect, beforeEach } from 'vitest'
import { registerSparkComponent, getSparkComponent, getRegisteredComponentTypes } from '../src/utils/componentRegistry'

describe('componentRegistry', () => {
  beforeEach(() => {
    // Type-level reset not exposed; register with unique type to avoid cross-test interference
  })

  it('registers and retrieves a component', () => {
    const fake = {} as any
    registerSparkComponent('test-type-1', fake)
    expect(getSparkComponent('test-type-1')).toBe(fake)
    const types = getRegisteredComponentTypes()
    expect(types).toContain('test-type-1')
  })
})