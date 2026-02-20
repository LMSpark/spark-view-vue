import { describe, it, expect } from 'vitest'
import type { ComponentContext } from '@spark-view/spark-component'

describe('logger level filtering', () => {
  it('partial logger with only warn/error can be stored in capabilities', () => {
    let calledWarn = false

    const loggerImpl = {
      warn: (..._args: unknown[]) => { calledWarn = true },
      error: (..._args: unknown[]) => {}
    }

    const ctx: ComponentContext = {
      id: 'ctx-level',
      type: 'test',
      children: [],
      state: {},
      capabilities: new Map([['logger', loggerImpl]])
    }

    const logger = ctx.capabilities.get('logger') as Record<string, ((...args: unknown[]) => void) | undefined>
    // info is not implemented — caller should guard with optional chaining
    expect(logger['info']).toBeUndefined()
    logger['warn']?.('should call warn')
    expect(calledWarn).toBe(true)
  })
})