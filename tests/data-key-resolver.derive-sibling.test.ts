import { describe, expect, it } from 'vitest'
import { deriveSiblingFieldDataKey } from '@spark-view/spark-data'

describe('deriveSiblingFieldDataKey', () => {
  it('requires an explicit viewId', () => {
    expect(deriveSiblingFieldDataKey('Orders@rows', 'currentRow')).toBeUndefined()
  })

  it('keeps default viewId', () => {
    expect(deriveSiblingFieldDataKey('Orders@default@rows', 'currentRow')).toBe('Orders@default@currentRow')
  })

  it('keeps explicit viewId', () => {
    expect(deriveSiblingFieldDataKey('Orders@grid@rows', 'currentRow')).toBe('Orders@grid@currentRow')
  })

  it('keeps scope and viewId', () => {
    expect(deriveSiblingFieldDataKey('#Shared@Orders@grid@rows', 'selectedRows')).toBe('#Shared@Orders@grid@selectedRows')
  })

  it('returns undefined for invalid or empty key', () => {
    expect(deriveSiblingFieldDataKey('', 'currentRow')).toBeUndefined()
    expect(deriveSiblingFieldDataKey('not-a-data-key', 'currentRow')).toBeUndefined()
  })
})
