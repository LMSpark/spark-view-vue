import { describe, it, expect } from 'vitest'
import { defineCapability, sparkProvide, sparkConsume } from '@spark-view/spark-utils'
import { Spark } from '@spark-view/spark-component'

describe('Capability late-binding', () => {
  it('capability provided on parent should be discoverable from child via sparkConsume', () => {
    const { createContext, rootContext } = Spark.createSystem()
    const TEST_CAP = defineCapability<{ foo: () => string }>('test:capability-late-binding')

    // Create a parent context and a child
    const parentCtx = createContext({ type: 'parent', id: 'parent-1' }, rootContext)
    const childCtx = createContext({ type: 'child', id: 'child-1' }, parentCtx)

    // Initially no capability exists
    expect(sparkConsume(childCtx, TEST_CAP)).toBeNull()

    // Provide capability on parent
    sparkProvide(parentCtx, TEST_CAP, { foo: () => 'bar' })

    // After providing, the capability should be discoverable by walking the parent chain
    expect(sparkConsume(childCtx, TEST_CAP)).toBeTruthy()
    expect(sparkConsume(childCtx, TEST_CAP)?.foo()).toBe('bar')
  })
})
