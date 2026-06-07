import { describe, expect, it } from 'vitest'

import {
  toModuleAttributeMetadata,
  toModuleFunctionMetadata,
  type AiApiActionMetadata,
  type AiApiAttributeMetadata,
  type AiApiObjectMetadata,
} from '../modules/metadata'

const NESTED_API: AiApiObjectMetadata = {
  kind: 'child-api',
  name: 'Child API',
  description: 'Nested API on attribute',
  actions: [{
    name: 'refresh',
    methodName: 'refresh',
    description: 'Refresh child state',
    paramsSchema: { type: 'object', properties: { force: { type: 'boolean' } }, required: [] },
  }],
}

const ATTRIBUTE: AiApiAttributeMetadata = {
  name: 'workspace',
  description: 'Workspace handle',
  schema: { type: 'object' },
  readable: true,
  writable: false,
  api: NESTED_API,
}

const ACTION: AiApiActionMetadata = {
  name: 'open',
  methodName: 'open',
  description: 'Open workspace',
  paramsSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  examples: [{ intent: '打开工作区', args: { id: 'demo' } }],
  antiExamples: [{ reason: '仅查看列表时不应 open', user: '列出全部' }],
}

describe('vcm-to-module-metadata bridge', () => {
  it('maps attribute.api into AiModuleAttributeMetadata.api summary', () => {
    const mapped = toModuleAttributeMetadata(ATTRIBUTE)
    expect(mapped.api).toMatchObject({
      kind: 'child-api',
      actions: [{ name: 'refresh', paramNames: ['force'] }],
    })
  })

  it('maps action examples and antiExamples into function metadata', () => {
    const mapped = toModuleFunctionMetadata(ACTION)
    expect(mapped.examples).toEqual([{ intent: '打开工作区', args: { id: 'demo' } }])
    expect(mapped.antiExamples).toEqual([{ reason: '仅查看列表时不应 open', user: '列出全部' }])
  })
})
