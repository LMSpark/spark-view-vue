import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import { sparkProvide, sparkConsume } from '@spark-view/spark-utils'

describe('Capability late-binding', () => {
  it('capability provided on parent should be discoverable from child via sparkConsume', () => {
    const { createContext, rootContext } = Spark.createSystem()

    // Create a parent context and a child
    const parentCtx = createContext({ type: 'parent', id: 'parent-1' }, rootContext)
    const childCtx = createContext({ type: 'child', id: 'child-1' }, parentCtx)

    // Initially no capability exists
    expect(sparkConsume(childCtx, 'test-cap')).toBeUndefined()

    // Provide capability on parent
    sparkProvide(parentCtx, 'test-cap', { foo: () => 'bar' })

    // After providing, the capability should be discoverable by walking the parent chain
    expect(sparkConsume(childCtx, 'test-cap')).toBeTruthy()
    expect(sparkConsume<{ foo: () => string }>(childCtx, 'test-cap')?.foo()).toBe('bar')
  })
})
