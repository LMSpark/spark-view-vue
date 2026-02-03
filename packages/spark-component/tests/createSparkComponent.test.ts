/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { defineSparkComponent, createSparkComponent } from '../src/vue/createSparkComponent.js'
import { Spark } from '../src/spark-namespace.js'
import { createComponentRegistry } from '../src/utils/SparkComponentRegistry.js'
import { createComponentManager } from '../src/utils/SparkComponentManager.js'

describe('Spark Component Creation APIs', () => {
  describe('defineSparkComponent (unified API)', () => {
    it('creates a component with spark meta that can be registered and rendered by manager', () => {
      const registry = createComponentRegistry()
      const manager = createComponentManager(undefined, registry)

      const Comp = defineSparkComponent({
        type: 'unified-type',
        name: 'unified',
        version: '0.1.0',
        setup(_props, _helpers) {
          return () => null
        }
      })

      const prevManager = (Spark as unknown as { manager?: () => unknown }).manager
      try {
        ;(Spark as unknown as { manager?: () => unknown }).manager = () => manager
        Spark.register(Comp as unknown as unknown)
      } finally { (Spark as unknown as { manager?: () => unknown }).manager = prevManager }

      expect(registry.has('unified-type')).toBe(true)
      const inst = manager.render({ type: 'unified-type' })
      expect((inst as { component?: unknown }).component).toBe(Comp)
    })

    it('auto-registers component when autoRegister is true', () => {
      const registry = createComponentRegistry()
      const manager = createComponentManager(undefined, registry)

      // Mock the global Spark namespace
      const originalSpark = globalThis.Spark
      globalThis.Spark = Spark as any

      const prevManager = (Spark as unknown as { manager?: () => unknown }).manager
      try {
        ;(Spark as unknown as { manager?: () => unknown }).manager = () => manager

        const Comp = defineSparkComponent({
          type: 'auto-register-type',
          name: 'auto-register',
          version: '1.0.0',
          autoRegister: true,
          setup(_props, _helpers) {
            return () => null
          }
        })

        // Component should be auto-registered
        expect(registry.has('auto-register-type')).toBe(true)
        const inst = manager.render({ type: 'auto-register-type' })
        expect((inst as { component?: unknown }).component).toBe(Comp)
      } finally {
        ;(Spark as unknown as { manager?: () => unknown }).manager = prevManager
        globalThis.Spark = originalSpark
      }
    })

    it('does not auto-register when autoRegister is false or undefined', () => {
      const registry = createComponentRegistry()
      const manager = createComponentManager(undefined, registry)

      // Mock the global Spark namespace
      const originalSpark = globalThis.Spark
      globalThis.Spark = Spark as any

      const prevManager = (Spark as unknown as { manager?: () => unknown }).manager
      try {
        ;(Spark as unknown as { manager?: () => unknown }).manager = () => manager

        const Comp = defineSparkComponent({
          type: 'manual-register-type',
          name: 'manual-register',
          version: '1.0.0',
          // autoRegister: false (default)
          setup(_props, _helpers) {
            return () => null
          }
        })

        // Component should NOT be auto-registered
        expect(registry.has('manual-register-type')).toBe(false)

        // Manual registration should work
        Spark.register(Comp as unknown as unknown)
        expect(registry.has('manual-register-type')).toBe(true)
      } finally {
        ;(Spark as unknown as { manager?: () => unknown }).manager = prevManager
        globalThis.Spark = originalSpark
      }
    })

    it('supports template rendering with interpolation', () => {
      const registry = createComponentRegistry()
      const manager = createComponentManager(undefined, registry)

      const Comp = defineSparkComponent({
        type: 'template-type',
        name: 'template',
        version: '1.0.0',
        template: ({ config }, { isDisabled }) =>
          `<button disabled="${isDisabled}" class="btn-${config.props?.variant || 'primary'}">${config.props?.label || 'Default'}</button>`
      })

      const prevManager = (Spark as unknown as { manager?: () => unknown }).manager
      try {
        ;(Spark as unknown as { manager?: () => unknown }).manager = () => manager
        Spark.register(Comp as unknown as unknown)
      } finally { (Spark as unknown as { manager?: () => unknown }).manager = prevManager }

      expect(registry.has('template-type')).toBe(true)

      // Test rendering with different configs
      const config1 = { type: 'template-type', props: { label: 'Click Me', variant: 'success' } }
      const config2 = { type: 'template-type', props: { label: 'Submit' } }

      const inst1 = manager.render(config1)
      const inst2 = manager.render(config2)

      expect((inst1 as { component?: unknown }).component).toBe(Comp)
      expect((inst2 as { component?: unknown }).component).toBe(Comp)
    })
  })

  describe('createSparkComponent (legacy API)', () => {
    it('still works for backward compatibility', () => {
      const registry = createComponentRegistry()
      const manager = createComponentManager(undefined, registry)

      const Comp = createSparkComponent({
        meta: { type: 'legacy-type', name: 'legacy', version: '0.1.0' },
        setup(_props) {
          return () => null
        }
      })

      const prevManager = (Spark as unknown as { manager?: () => unknown }).manager
      try {
        ;(Spark as unknown as { manager?: () => unknown }).manager = () => manager
        Spark.register(Comp as unknown as unknown)
      } finally { (Spark as unknown as { manager?: () => unknown }).manager = prevManager }

      expect(registry.has('legacy-type')).toBe(true)
      const inst = manager.render({ type: 'legacy-type' })
      expect((inst as { component?: unknown }).component).toBe(Comp)
    })
  })
})