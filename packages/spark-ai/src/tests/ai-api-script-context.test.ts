import { describe, expect, it, vi } from 'vitest'

import {
  createAiApiScriptContext,
  executeAiApiAction,
  executeAiNativeScript,
} from '../agent/native-runtime'
import { paramsSchema, type AiJsonParams } from '../json'
import type { AiApiObjectMetadata } from '../modules/metadata'

type ScriptCallableForTest = (...args: readonly unknown[]) => unknown

const configPageApi: AiApiObjectMetadata = {
  kind: 'config-page',
  name: 'Config Page',
  description: 'test',
  actions: [
    {
      name: 'setFileText',
      methodName: 'setFileText',
      description: 'write file',
      paramsSchema: paramsSchema({
        name: { type: 'string' },
        text: { type: 'string' },
      }, ['name', 'text']),
      takesContext: false,
    },
    {
      name: 'getFileText',
      methodName: 'getFileText',
      description: 'read file',
      paramsSchema: paramsSchema({
        name: { type: 'string' },
      }, ['name']),
      takesContext: false,
    },
    {
      name: 'editDataSet',
      methodName: 'editDataSet',
      description: 'mutate dataset',
      paramsSchema: paramsSchema({ run: true }, ['run']),
      takesContext: false,
      resultApis: [{
        resultPath: [],
        api: {
          kind: 'dataset',
          name: 'DataSet',
          description: 'dataset',
          actions: [{
            name: 'createTable',
            methodName: 'createTable',
            description: 'create table',
            paramsSchema: paramsSchema({
              options: {
                type: 'object',
                properties: {
                  tableName: { type: 'string' },
                  columns: { type: 'array' },
                },
                required: ['tableName', 'columns'],
              },
            }, ['options']),
            takesContext: false,
          }],
        },
      }],
    },
  ],
}

const projectApi: AiApiObjectMetadata = {
  kind: 'project',
  name: 'Project',
  description: 'test',
  actions: [{
    name: 'openPageDesign',
    methodName: 'openPageDesign',
    description: 'open page',
    paramsSchema: paramsSchema({ pageId: { type: 'string' } }, ['pageId']),
    takesContext: false,
    resultApis: [{ resultPath: [], api: configPageApi }],
  }],
}

describe('createAiApiScriptContext', () => {
  it('coalesces mutator callback into { run } for nested config-page actions', async () => {
    const editDataSet = vi.fn(async (run: (tool: { tag: string }) => void) => {
      run({ tag: 'dataset' })
    })
    const rawPage = { editDataSet }
    const openPageDesign = vi.fn(() => rawPage)
    const project = { openPageDesign }
    const ctx = { segments: [] as const }
    const scriptContext = createAiApiScriptContext(project, projectApi, ctx)
    const openPage = scriptContext['openPageDesign'] as (args: { pageId: string }) => Promise<Readonly<Record<string, (fn: () => void) => Promise<unknown>>>>
    const page = await openPage({ pageId: 'leave-page' })
    expect(page).not.toBe(rawPage)
    const editDataSetOnPage = page['editDataSet']
    expect(editDataSetOnPage).toBeTypeOf('function')
    const mutator = vi.fn()
    await editDataSetOnPage!(mutator)
    expect(openPageDesign).toHaveBeenCalledWith('leave-page')
    expect(editDataSet).toHaveBeenCalledOnce()
    expect(typeof editDataSet.mock.calls[0]?.[0]).toBe('function')
    expect(mutator).toHaveBeenCalledWith({ tag: 'dataset' })
  })

  it('wraps native object and positional arguments to generated paramsSchema names', async () => {
    const createTable = vi.fn()
    const editDataSet = vi.fn(async (run: (tool: { createTable: typeof createTable }) => void) => {
      run({ createTable })
    })
    const setFileText = vi.fn()
    const getFileText = vi.fn(() => 'export default {}')
    const rawPage = { editDataSet, setFileText, getFileText }
    const project = { openPageDesign: vi.fn(() => rawPage) }
    const scriptContext = createAiApiScriptContext(project, projectApi, { segments: [] })
    const openPage = scriptContext['openPageDesign'] as (args: { pageId: string }) => Promise<Readonly<Record<string, ScriptCallableForTest>>>
    const page = await openPage({ pageId: 'orders-page' })

    await page['editDataSet']!(async (ds: { createTable: ScriptCallableForTest }) => {
      ds.createTable({
        tableName: 'orders',
        columns: [],
      })
    })
    page['setFileText']!('script.js', 'export default {}')
    const script = page['getFileText']!('script.js')

    expect(createTable).toHaveBeenCalledWith({
      tableName: 'orders',
      columns: [],
    })
    expect(setFileText).toHaveBeenCalledWith('script.js', 'export default {}')
    expect(getFileText).toHaveBeenCalledWith('script.js')
    expect(script).toBe('export default {}')
  })

  it('rejects mistaken createTable args passed to editDataSet via script proxy', async () => {
    const editDataSet = vi.fn(async () => undefined)
    const rawPage = { editDataSet }
    const scriptContext = createAiApiScriptContext({ openPageDesign: vi.fn(() => rawPage) }, projectApi, { segments: [] })
    const openPage = scriptContext['openPageDesign'] as (args: { pageId: string }) => Promise<Readonly<Record<string, ScriptCallableForTest>>>
    const page = await openPage({ pageId: 'leave-page' })
    await expect(async () => page['editDataSet']!({
      tableName: 'LeaveRequest',
      columns: [],
    })).rejects.toThrow()
    expect(editDataSet).not.toHaveBeenCalled()
  })
})

describe('executeAiApiAction', () => {
  it('accepts direct callback when paramsSchema requires run', async () => {
    const editDataSet = vi.fn(async () => undefined)
    const action = readConfigPageAction('editDataSet')
    const result = await executeAiApiAction({ editDataSet }, action, (() => undefined) as never, { segments: [] })
    expect(result.ok).toBe(true)
    expect(editDataSet).toHaveBeenCalledOnce()
  })

  it('unwraps { run } object for mutator methods', async () => {
    const editDataSet = vi.fn(async () => undefined)
    const action = readConfigPageAction('editDataSet')
    const mutator = vi.fn()
    const result = await executeAiApiAction(
      { editDataSet },
      action,
      { run: mutator } as unknown as AiJsonParams,
      { segments: [] },
    )
    expect(result.ok).toBe(true)
    expect(editDataSet).toHaveBeenCalledWith(mutator)
  })

  it('rejects non-function run before calling mutator method', async () => {
    const editDataSet = vi.fn(async () => undefined)
    const action = readConfigPageAction('editDataSet')
    const result = await executeAiApiAction(
      { editDataSet },
      action,
      { run: { tableName: 'LeaveRequest' } } as unknown as AiJsonParams,
      { segments: [] },
    )
    expect(result.ok).toBe(false)
    expect(editDataSet).not.toHaveBeenCalled()
  })
})

describe('executeAiNativeScript', () => {
  it('runs script directly from VCM metadata without AiAgentHost', async () => {
    const createTable = vi.fn()
    const editDataSet = vi.fn(async (run: (tool: { createTable: typeof createTable }) => void) => {
      run({ createTable })
    })
    const rawPage = {
      editDataSet,
      getFileText: vi.fn((name: string) => name === 'script.js' ? 'export default {}' : '{}'),
    }
    const project = { openPageDesign: vi.fn(() => rawPage) }

    const result = await executeAiNativeScript({
      instance: project,
      metadata: { schemaVersion: 1, rootApi: projectApi },
      script: [
        'const page = await this.openPageDesign({ pageId: "orders-page" })',
        'await page.editDataSet(async (ds) => {',
        '  ds.createTable({ tableName: "orders", columns: [] })',
        '})',
        'return { script: page.getFileText("script.js") }',
      ].join('\n'),
    })

    expect(result.ok).toBe(true)
    expect(project.openPageDesign).toHaveBeenCalledWith('orders-page')
    expect(createTable).toHaveBeenCalledWith({
      tableName: 'orders',
      columns: [],
    })
    expect(result.data).toEqual({ script: 'export default {}' })
  })

  it('uses generated schemaDefs while validating nested native API calls', async () => {
    const metadataWithSchemaRef = {
      schemaVersion: 1,
      rootApi: {
        ...projectApi,
        actions: [{
          ...projectApi.actions[0]!,
          resultApis: [{
            resultPath: [],
            api: {
              ...configPageApi,
              actions: [{
                ...configPageApi.actions[2]!,
                resultApis: [{
                  resultPath: [],
                  api: {
                    kind: 'dataset',
                    name: 'DataSet',
                    description: 'dataset',
                    actions: [{
                      name: 'createTable',
                      methodName: 'createTable',
                      description: 'create table',
                      paramsSchema: paramsSchema({
                        options: { $ref: '#/$defs/TableOptions' },
                      }, ['options']),
                      takesContext: false,
                    }],
                  },
                }],
              }],
            },
          }],
        }],
      },
    } as const
    const createTable = vi.fn()
    const editDataSet = vi.fn(async (run: (tool: { createTable: typeof createTable }) => void) => {
      run({ createTable })
    })
    const project = { openPageDesign: vi.fn(() => ({ editDataSet })) }

    const result = await executeAiNativeScript({
      instance: project,
      metadata: metadataWithSchemaRef,
      schemaDefs: {
        TableOptions: {
          type: 'object',
          properties: {
            tableName: { type: 'string' },
            columns: { type: 'array' },
          },
          required: ['tableName', 'columns'],
          additionalProperties: false,
        },
      },
      script: [
        'const page = await this.openPageDesign({ pageId: "orders-page" })',
        'await page.editDataSet(async (ds) => ds.createTable({ tableName: "orders", columns: [] }))',
        'return { ok: true }',
      ].join('\n'),
    })

    expect(result.ok).toBe(true)
    expect(createTable).toHaveBeenCalledWith({
      tableName: 'orders',
      columns: [],
    })
  })
})

function readConfigPageAction(name: string) {
  const action = configPageApi.actions.find(candidate => candidate.name === name)
  if (action === undefined) throw new Error(`missing test action ${name}`)
  return action
}
