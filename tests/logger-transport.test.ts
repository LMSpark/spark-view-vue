import { describe, it, expect, vi } from 'vitest'
import { createFileTransport } from '@spark-view/spark-core'
import { existsSync, readFileSync, unlinkSync } from 'fs'

describe('file transport', () => {
  it('writes to file when fs available', () => {
    const file = './tmp-test-log.txt'

    // Ensure cleanup
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch (e) {
      // best-effort cleanup, ignore failures but record for debugging
      console.debug('cleanup failed', e)
    }

    const provider = createFileTransport(file)
    const logger = provider.implementation as { info: (...args: unknown[]) => void }
    logger.info('hello', { a: 1 })

    const content = readFileSync(file, 'utf8')
    expect(content).toContain('hello')

    // cleanup
    unlinkSync(file)
  })
})