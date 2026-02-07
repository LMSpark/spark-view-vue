/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { defineSparkComponent } from '../src/vue/createSparkComponent.js'
import { Spark } from '../src/spark-namespace.js'

describe('Spark Vue Base component (integration)', () => {
  it('component created with defineSparkComponent registers and renders via manager.render', async () => {
    const { manager, registry } = Spark.createSystem()

    const Comp = defineSparkComponent({
      type: 'base-type',
      name: 'base',
      version: '1.0.0',
      setup(_props, _helpers) {
        return () => null
      }
    })

    // register via component meta helper
    const prevManager = (Spark as any).manager
    try {
      ;(Spark as any).manager = () => manager as any
      Spark.register(Comp as any)
    } finally {
      ;(Spark as any).manager = prevManager
    }

    // use manager.render to verify registry-driven render behavior (no .vue import in package tests)
    const instance = manager.render({ type: 'base-type', children: [] } as any)
    expect(instance).toBeTruthy()
    expect((instance as any).component).toBe(Comp)
    expect(registry.has('base-type')).toBe(true)
  })
})