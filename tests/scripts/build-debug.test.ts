import { describe, expect, it, vi } from 'vitest'

describe('build-debug', () => {
  it('buildDebugBreak does not throw without attached inspector', async () => {
    const { buildDebugBreak } = await import('../../scripts/lib/build-debug.mjs')
    expect(() => buildDebugBreak('test-step', { ok: true })).not.toThrow()
  })

  it('buildDebugTrace logs when SPARK_BUILD_TRACE=1', async () => {
    const previous = process.env.SPARK_BUILD_TRACE
    process.env.SPARK_BUILD_TRACE = '1'
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      vi.resetModules()
      const { buildDebugTrace } = await import('../../scripts/lib/build-debug.mjs')
      buildDebugTrace('trace-step', { n: 1 })
      expect(logs).toHaveBeenCalledWith('[build-trace] trace-step {"n":1}')
    } finally {
      logs.mockRestore()
      if (previous === undefined) delete process.env.SPARK_BUILD_TRACE
      else process.env.SPARK_BUILD_TRACE = previous
    }
  })
})
