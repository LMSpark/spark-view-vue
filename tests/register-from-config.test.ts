import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-core'

describe('registerLogical', () => {
  it('should register a logical component from ComponentConfig', () => {
    const config = {
      type: 'logical-component',
      name: 'Logical Component',
      children: [
        { type: 'child-component', field: 'test' }
      ]
    }

    // Register the logical component
    Spark.registerLogical(config)

    // Verify it was registered
    const registry = Spark.manager().registry
    const registered = registry.get('logical-component')
    expect(registered).toBeDefined()
    expect(registered?.type).toBe('logical-component')
    expect(registered?.name).toBe('Logical Component')
    expect(registered?.version).toBe('1.0.0') // default version
  })

  it('should render logical component as fragment with children', () => {
    const config = {
      type: 'logical-container',
      children: [
        { type: 'logical-container', name: 'Nested Child', children: [] }
      ]
    }

    // Register the logical component
    Spark.registerLogical(config)

    // Test rendering
    const renderer = Spark.manager().renderer
    const result = renderer.renderComponentTree(config)

    expect(result.type).toBe('fragment')
    expect(result.children).toHaveLength(1)
    // The child should also be a fragment since it's a logical component with no children
    expect(result.children?.[0].type).toBe('fragment')
  })

  it('should handle component config with custom version', () => {
    const config = {
      type: 'versioned-component',
      name: 'Versioned Component',
      version: '2.1.0'
    }

    Spark.registerLogical(config)

    const registered = Spark.manager().registry.get('versioned-component')
    expect(registered?.version).toBe('2.1.0')
  })
})