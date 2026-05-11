import { describe, expect, it } from 'vitest'

import * as SparkAi from '../packages/spark-ai/src'

describe('ai runtime class-only public surface', () => {
  it('exposes class-first runtime and parameter payload registry only', () => {
    expect('createAiRuntime' in SparkAi).toBe(false)

    expect(typeof SparkAi.AiRuntime).toBe('function')
    expect(typeof SparkAi.ParameterPayloadRegistry).toBe('function')
    expect(SparkAi.ParameterPayloadRegistry.defaultRegistry).toBeInstanceOf(SparkAi.ParameterPayloadRegistry)
    expect('PageDesignBusiness' in SparkAi).toBe(false)
    expect(typeof SparkAi.PageDesignModule).toBe('function')
  })
})
