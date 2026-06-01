import { describe, expect, it } from 'vitest'

import { AiModuleAdapter } from '../agent'
import {
  AiModuleResult,
  type AiModuleMetadataJson,
  type AiModulePathContext,
} from '../modules'
import type { AiJsonValue } from '../json'

class DirectoryApi {
  public search(
    _ctx: AiModulePathContext,
    args: Readonly<{ keyword?: string }>,
  ): AiModuleResult<AiJsonValue> {
    return AiModuleResult.ok({
      keyword: args.keyword ?? '',
      results: ['alice'],
    })
  }
}

class RootApi {
  private readonly directory = new DirectoryApi()

  public listDirectory(): AiModuleResult<Readonly<{ directory: DirectoryApi }>> {
    return AiModuleResult.ok({ directory: this.directory })
  }
}

const TEST_METADATA: AiModuleMetadataJson = {
  schemaVersion: 1,
  rootApi: {
    kind: 'root-api',
    name: 'Root API',
    description: 'Root API for adapter tests',
    actions: [
      {
        name: 'listDirectory',
        methodName: 'listDirectory',
        description: 'Return a handle-bearing directory object',
        paramsSchema: { type: 'object', properties: {}, required: [] },
        resultApis: [
          {
            resultPath: ['directory'],
            api: {
              kind: 'directory-api',
              name: 'Directory API',
              description: 'Searchable directory',
              actions: [
                {
                  name: 'search',
                  methodName: 'search',
                  description: 'Search people',
                  paramsSchema: {
                    type: 'object',
                    properties: { keyword: { type: 'string' } },
                    required: [],
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  },
}

describe('AiModuleAdapter', () => {
  it('creates API object handles from resultApis and dispatches module_handle_call', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })
    const host = { moduleId: 'root-api', moduleInstanceId: 'case-1', instanceId: 'turn-1' }

    const rootResult = await registration.runtime.executeTool('listDirectory', {
      path: '/root-api[case-1]',
      args: {},
    }, host)

    expect(rootResult.ok).toBe(true)
    const handleId = readFirstHandleId(rootResult.data)
    expect(handleId).toMatch(/^hnd_/u)

    const handleResult = await registration.runtime.executeTool('module_handle_call', {
      handleId,
      actionName: 'search',
      args: { keyword: 'ali' },
    }, host)

    expect(handleResult).toMatchObject({
      ok: true,
      data: {
        keyword: 'ali',
        results: ['alice'],
      },
    })
  })
})

function readFirstHandleId(value: AiJsonValue | undefined): string {
  expect(isJsonObject(value)).toBe(true)
  if (!isJsonObject(value)) return ''
  const handles = value['_handles']
  expect(Array.isArray(handles)).toBe(true)
  if (!Array.isArray(handles)) return ''
  const first = handles[0]
  expect(isJsonObject(first)).toBe(true)
  if (!isJsonObject(first)) return ''
  const handleId = first['handleId']
  return typeof handleId === 'string' ? handleId : ''
}

function isJsonObject(value: unknown): value is Readonly<Record<string, AiJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
