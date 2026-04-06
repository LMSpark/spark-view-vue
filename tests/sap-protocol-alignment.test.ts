import { describe, expect, it } from 'vitest'
import { extractSapProtocolBlocks, stripSapProtocolBlocks } from '@/services/sap-protocol'

describe('SAP protocol alignment', () => {
  it('extracts a single canonical SAP block', () => {
    const text = [
      '@@request:file.write#req-1',
      '{"path":"output/a.txt","content":"A"}',
      '@@end',
    ].join('\n')

    const extraction = extractSapProtocolBlocks(text)

    expect(extraction.kind).toBe('single')
    expect(extraction.blocks).toHaveLength(1)
    expect(extraction.blocks[0]?.type).toBe('request')
    expect(extraction.blocks[0]?.action).toBe('file.write')
  })

  it('marks multiple canonical SAP blocks as a protocol violation candidate', () => {
    const text = [
      '@@request:db.query#req-2',
      '{"sql":"SELECT 1"}',
      '@@end',
      '@@describe:system.capabilities#cap-1',
      '{}',
      '@@end',
    ].join('\n')

    const extraction = extractSapProtocolBlocks(text)

    expect(extraction.kind).toBe('multiple')
    expect(extraction.blocks).toHaveLength(2)
  })

  it('strips canonical SAP blocks', () => {
    const text = [
      '开始执行',
      '@@request:db.query#req-2',
      '{"sql":"SELECT 1"}',
      '@@end',
      '中间说明',
    ].join('\n')

    const stripped = stripSapProtocolBlocks(text)

    expect(stripped).toContain('开始执行')
    expect(stripped).toContain('中间说明')
    expect(stripped).not.toContain('@@request:db.query#req-2')
  })
})