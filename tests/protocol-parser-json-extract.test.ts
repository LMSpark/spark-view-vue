import { describe, expect, it } from 'vitest'
import { AiInvocationProtocol } from '../packages/spark-ai/src'

describe('extractFirstJsonObject', () => {
  it('extracts the first balanced object from mixed text', () => {
    const raw = 'prefix {"a":1,"b":{"c":2}} suffix {"ignored":true}'
    expect(AiInvocationProtocol.extractFirstJsonObject(raw)).toBe('{"a":1,"b":{"c":2}}')
  })

  it('handles braces inside JSON strings', () => {
    const raw = 'xx {"text":"a { brace } in string","ok":true} yy'
    expect(AiInvocationProtocol.extractFirstJsonObject(raw)).toBe('{"text":"a { brace } in string","ok":true}')
  })

  it('returns null for unbalanced JSON object', () => {
    const raw = 'prefix {"a":1,"b":{"c":2} '
    expect(AiInvocationProtocol.extractFirstJsonObject(raw)).toBeNull()
  })

  it('returns null when no object exists', () => {
    expect(AiInvocationProtocol.extractFirstJsonObject('plain text only')).toBeNull()
  })
})

describe('parseActionPath', () => {
  it('parses LLM-facing instance action paths', () => {
    expect(AiInvocationProtocol.parseActionPath('dept-1/person-9@basicInfo@update')).toEqual({
      format: 'instance',
      instanceIds: ['dept-1', 'person-9'],
      moduleIds: ['basicInfo'],
      modulePath: 'basicInfo',
      moduleId: 'basicInfo',
      function: 'update',
    })
  })

  it('decodes URI-encoded instance path segments without treating encoded slashes as hierarchy', () => {
    expect(AiInvocationProtocol.parseActionPath('lmspark%2Fhomepage/person%409@basicInfo@update')).toEqual({
      format: 'instance',
      instanceIds: ['lmspark/homepage', 'person@9'],
      moduleIds: ['basicInfo'],
      modulePath: 'basicInfo',
      moduleId: 'basicInfo',
      function: 'update',
    })
  })

  it('keeps legacy module action paths parseable for compatibility', () => {
    expect(AiInvocationProtocol.parseActionPath('department/personnel/basicInfo/update')).toEqual({
      format: 'legacy',
      instanceIds: [],
      moduleIds: ['department', 'personnel', 'basicInfo'],
      modulePath: 'department/personnel/basicInfo',
      moduleId: 'basicInfo',
      function: 'update',
    })
  })

  it('rejects malformed instance action paths', () => {
    expect(() => AiInvocationProtocol.parseActionPath('department@@update')).toThrow('非法 action 路径')
    expect(() => AiInvocationProtocol.parseActionPath('dept-1@department/basicInfo@update')).toThrow('非法 action 路径')
  })
})
