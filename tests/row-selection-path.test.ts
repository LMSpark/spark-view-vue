import { describe, expect, it } from 'vitest'
import { resolveCurrentRowPath } from '../packages/spark-component/src/components/support/row-selection-path'

describe('row-selection-path', () => {
  it('returns contextRow when it is present (even with some undefined fields)', () => {
    const contextRow = { id: 1, name: undefined }
    const currentRow = { id: 2, name: 'Bob' }
    // contextRow is the active form model — it should take priority
    expect(resolveCurrentRowPath(contextRow, { currentRow })).toBe(contextRow)
  })

  it('falls back to dataSource.currentRow when contextRow is null', () => {
    const currentRow = { id: 2, name: 'Bob' }
    expect(resolveCurrentRowPath(null, { currentRow })).toEqual(currentRow)
  })

  it('falls back to dataSource.currentRow when contextRow is undefined', () => {
    const currentRow = { id: 2, name: 'Bob' }
    expect(resolveCurrentRowPath(undefined, { currentRow })).toEqual(currentRow)
  })
})
