import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const FIXTURE_DIR = path.resolve('tests/fixtures/page-design-leave-request-smoke')

describe('pageDesign E2E artifact validator', () => {
  it('passes relaxed leave-request smoke fixture', () => {
    if (!existsSync(path.join(FIXTURE_DIR, 'rule.json'))) {
      throw new Error(`missing fixture: ${FIXTURE_DIR}`)
    }

    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/verify-page-design-e2e.mjs', '--validate-dir', FIXTURE_DIR],
      {
        cwd: path.resolve('.'),
        encoding: 'utf8',
        shell: false,
      },
    )

    if (result.status !== 0) {
      throw new Error(result.stdout || result.stderr || `validate-dir exit ${String(result.status ?? '?')}`)
    }

    const payload = JSON.parse(result.stdout ?? '{}') as { ok?: boolean }
    expect(payload.ok).toBe(true)
  })
})
