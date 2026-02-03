/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { Spark } from '../src/spark-namespace.js'

describe('GlobalProviderRegistry removal', () => {
  it('should not expose global provider helpers on Spark namespace', () => {
    expect((Spark as any).registerGlobalProvider).toBeUndefined()
    expect((Spark as any).getGlobalProvider).toBeUndefined()
    expect((Spark as any).getOrCreateNoopProvider).toBeUndefined()
  })
})