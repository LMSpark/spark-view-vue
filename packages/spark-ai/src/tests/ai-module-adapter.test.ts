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

  public echo(args: Readonly<{ text: string }>): AiModuleResult<AiJsonValue> {
    return AiModuleResult.ok({ text: args.text })
  }

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
        name: 'echo',
        methodName: 'echo',
        description: 'Echo one-argument VCM method args',
        paramsSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
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

  it('calls one-argument VCM methods with args instead of ctx', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })

    const result = await registration.runtime.executeTool('echo', {
      path: '/root-api[root]',
      args: { text: 'hello' },
    }, { moduleId: 'root-api', moduleInstanceId: '', instanceId: 'turn-1' })

    expect(result).toMatchObject({
      ok: true,
      data: { text: 'hello' },
    })
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

  it('registers VCM result APIs as guide-only protocol modules', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })

    const query = await registration.runtime.executeTool('module_query', {
      kind: 'directory-api',
      includeFunctions: true,
    })

    expect(query).toMatchObject({
      ok: true,
      data: {
        modules: [expect.objectContaining({
          kind: 'directory-api',
          functionNames: ['search'],
        })],
        functions: [expect.objectContaining({
          kind: 'directory-api',
          functionName: 'search',
        })],
      },
    })

    const guide = await registration.runtime.executeTool('module_function_guide', {
      kind: 'directory-api',
      functionName: 'search',
    })

    expect(guide).toMatchObject({
      ok: true,
      data: {
        kind: 'directory-api',
        functionName: 'search',
        paramsSchema: {
          required: ['keyword'],
        },
      },
    })

    const toolNames = registration.runtime.getTools().map(tool => tool.function.name)
    expect(toolNames).toContain('module_script')
    expect(toolNames).not.toContain('listDirectory')
    expect(toolNames).not.toContain('search')
    expect(registration.runtime.inspect().ok).toBe(true)
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
        childProperties: ['title', 'nested'],
      },
    })
    expect(isJsonObject(rootGuide.data) && 'schemaPath' in rootGuide.data).toBe(false)
  })

  it('can query a complex attribute local property schema', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })

    const nestedGuide = await registration.runtime.executeTool('module_attribute_guide', {
      kind: 'root-api',
      attrName: 'config',
      property: 'nested',
    })

    expect(nestedGuide).toMatchObject({
      ok: true,
      data: {
        property: 'nested',
        schema: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
          },
        },
        childProperties: ['enabled'],
      },
    })
    expect(isJsonObject(nestedGuide.data) && 'schemaPath' in nestedGuide.data).toBe(false)
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

  it('projects metadata-first prompt snapshot without module_find guidance', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: TEST_METADATA,
      options: {},
    })

    const snapshot = registration.runtime.projectKnowledge().promptSnapshot
    expect(snapshot).toContain('module_script')
    expect(snapshot).not.toMatch(/module_find/)
    expect(snapshot).not.toMatch(/moduleInstanceId/)
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

    expect(result.ok).toBe(false)
    expect(result.checks?.[0]?.code).toBe('SCHEMA_VALIDATION_FAILED')
    expect(result.checks?.[1]?.code).toBe('SCRIPT_EXECUTION_FAILED')
  })

  it('projects VCM constructorSignature and function examples into module guides', async () => {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: RootApi,
      metadata: {
        schemaVersion: 1,
        rootApi: {
          kind: 'root-api',
          name: 'Root API',
          description: 'Root API for VCM bridge tests',
          constructorSignature: {
            description: 'Create root API instance.',
            paramsSchema: {
              type: 'object',
              properties: { seed: { type: 'string' } },
              required: ['seed'],
            },
          },
          actions: [{
            name: 'echo',
            methodName: 'echo',
            description: 'Echo text',
            paramsSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
            examples: [{ intent: '回显文本', args: { text: 'hi' } }],
          }],
        },
      },
      options: {},
    })

    const kindGuide = await registration.runtime.executeTool('module_guide', { kind: 'root-api' })
    expect(kindGuide).toMatchObject({
      ok: true,
      data: {
        constructorSignature: {
          description: 'Create root API instance.',
          paramsSchema: { type: 'object' },
        },
      },
    })

    const fnGuide = await registration.runtime.executeTool('module_function_guide', {
      kind: 'root-api',
      functionName: 'echo',
    })
    expect(fnGuide).toMatchObject({
      ok: true,
      data: {
        examples: [{ intent: '回显文本', args: { text: 'hi' } }],
      },
    })
  })
})

function isJsonObject(value: unknown): value is Readonly<Record<string, AiJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
