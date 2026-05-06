import { describe, expect, it } from 'vitest'
import { extractFirstJsonObject } from '../packages/spark-ai/src'

describe('extractFirstJsonObject', () => {
  it('extracts the first balanced object from mixed text', () => {
    const raw = 'prefix {"a":1,"b":{"c":2}} suffix {"ignored":true}'
    expect(extractFirstJsonObject(raw)).toBe('{"a":1,"b":{"c":2}}')
  })

  it('handles braces inside JSON strings', () => {
    const raw = 'xx {"text":"a { brace } in string","ok":true} yy'
    expect(extractFirstJsonObject(raw)).toBe('{"text":"a { brace } in string","ok":true}')
  })

  it('returns null for unbalanced JSON object', () => {
    const raw = 'prefix {"a":1,"b":{"c":2} '
    expect(extractFirstJsonObject(raw)).toBeNull()
  })

  it('returns null when no object exists', () => {
    expect(extractFirstJsonObject('plain text only')).toBeNull()
  })
})
