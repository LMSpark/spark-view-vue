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

  public getDirectory(): AiModuleResult<DirectoryApi> {
    return AiModuleResult.ok(this.directory)
  }
}

const TEST_METADATA: AiModuleMetadataJson = {
  schemaVersion: 1,
  rootApi: {
    kind: 'root-api',
    name: 'Root API',
    description: 'Root API for adapter tests',
    attributes: [
      {
        name: 'config',
        description: 'Complex root config',
        readable: true,
        writable: false,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            nested: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
              },
              required: ['enabled'],
            },
          },
          required: ['title'],
        },
      },
    ],
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
                    required: ['keyword'],
                  },
                },
              ],
            },
          },
        ],
      },
      {
        name: 'getDirectory',
        methodName: 'getDirectory',
        description: 'Return the directory API object itself',
        paramsSchema: { type: 'object', properties: {}, required: [] },
        resultApis: [
          {
            resultPath: [],
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
                    required: ['keyword'],
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
  it('returns action data without synthetic handles', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })
    const host = { moduleId: 'root-api', moduleInstanceId: '', instanceId: 'turn-1' }

    const rootResult = await registration.runtime.executeTool('listDirectory', {
      path: '/root-api[root]',
      args: {},
    }, host)

    expect(rootResult.ok).toBe(true)
    expect(rootResult).toMatchObject({
      data: {
        directory: {},
      },
    })
    expect(isJsonObject(rootResult.data) && '_handles' in rootResult.data).toBe(false)
  })

  it('exposes resultApis through function guide metadata', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })

    const guide = await registration.runtime.executeTool('module_function_guide', {
      kind: 'root-api',
      functionName: 'listDirectory',
    })

    expect(guide).toMatchObject({
      ok: true,
      data: {
        resultApis: [
          {
            resultPath: ['directory'],
            kind: 'directory-api',
            actions: [{ name: 'search', paramNames: ['keyword'] }],
          },
        ],
      },
    })
  })

  it('exposes declared attributes through attribute guides', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })

    const rootGuide = await registration.runtime.executeTool('module_attribute_guide', {
      kind: 'root-api',
      attrName: 'config',
    })
    expect(rootGuide).toMatchObject({
      ok: true,
      data: {
        name: 'config',
        schema: {
          type: 'object',
        },
      },
    })
    expect(isJsonObject(rootGuide.data) && 'schemaPath' in rootGuide.data).toBe(false)
  })

  it('executes provider submodule methods through this.property.method script chains', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })
    const host = { moduleId: 'root-api', moduleInstanceId: 'root-1', instanceId: 'turn-1' }

    const result = await registration.runtime.executeTool('module_script', {
      script: `
        return await this.listDirectory().directory.search({ keyword: 'ali' })
      `,
    }, host)

    expect(result).toMatchObject({
      ok: true,
      data: {
        keyword: 'ali',
        results: ['alice'],
      },
    })
  })

  it('executes resultPath root submodule methods through direct result chains', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })

    const result = await registration.runtime.executeTool('module_script', {
      script: `
        return await this.getDirectory().search({ keyword: 'bob' })
      `,
    }, { moduleId: 'root-api', moduleInstanceId: 'root-1', instanceId: 'turn-1' })

    expect(result).toMatchObject({
      ok: true,
      data: {
        keyword: 'bob',
        results: ['alice'],
      },
    })
  })

  it('validates paramsSchema for script chain action calls before invoking business methods', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })

    const result = await registration.runtime.executeTool('module_script', {
      script: `
        return await this.getDirectory().search({})
      `,
    }, { moduleId: 'root-api', moduleInstanceId: 'root-1', instanceId: 'turn-1' })

    expect(result).toMatchObject({
      ok: false,
      checks: [{
        code: 'SCRIPT_EXECUTION_FAILED',
      }],
    })
    expect(result.checks?.[0]?.message).toContain('SCHEMA_VALIDATION_FAILED')
  })
})

function isJsonObject(value: unknown): value is Readonly<Record<string, AiJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
