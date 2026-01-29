import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-core'

describe('spark-core namespace', () => {
  it('exports Spark namespace with manager getter', () => {
    expect(Spark).toBeTruthy()
    expect(typeof Spark).toBe('object')
    expect(typeof Spark.manager).toBe('function')
    expect(typeof Spark.capabilities).toBe('function')
  })
})