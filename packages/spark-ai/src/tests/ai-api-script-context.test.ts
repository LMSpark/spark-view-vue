import { describe, expect, it, vi } from 'vitest'

import {
  createAiApiScriptContext,
  executeAiApiAction,
  executeAiNativeScript,
} from '../agent/native-runtime'
import { paramsSchema, type AiJsonParams } from '../json'
import type { AiApiObjectMetadata } from '../vcm-native'

type ScriptCallableForTest = (...args: readonly unknown[]) => unknown

const toolApi: AiApiObjectMetadata = {
  kind: 'ToolModel',
  className: 'ToolModel',
  name: 'ToolModel',
  description: 'tool',
  actions: [{
    name: 'createItem',
    methodName: 'createItem',
    description: 'create item',
    paramsSchema: paramsSchema({
      options: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tags: { type: 'array' },
        },
        required: ['name', 'tags'],
      },
    }, ['options']),
    takesContext: false,
  }],
}

const childApi: AiApiObjectMetadata = {
  kind: 'ChildModel',
  className: 'ChildModel',
  name: 'ChildModel',
  description: 'child',
  actions: [
    {
      name: 'setLabel',
      methodName: 'setLabel',
      description: 'write label',
      paramsSchema: paramsSchema({
        label: { type: 'string' },
      }, ['label']),
      takesContext: false,
    },
    {
      name: 'getLabel',
      methodName: 'getLabel',
      description: 'read label',
      paramsSchema: paramsSchema({}, []),
      takesContext: false,
    },
    {
      name: 'editTool',
      methodName: 'editTool',
      description: 'mutate tool',
      paramsSchema: paramsSchema({ run: true }, ['run']),
      takesContext: false,
      resultApis: [{ resultPath: [], api: toolApi }],
    },
  ],
}

const rootApi: AiApiObjectMetadata = {
  kind: 'RootModel',
  className: 'RootModel',
  name: 'RootModel',
  description: 'root',
  actions: [{
    name: 'openChild',
    methodName: 'openChild',
    description: 'open child',
    paramsSchema: paramsSchema({ childId: { type: 'string' } }, ['childId']),
    takesContext: false,
    resultApis: [{ resultPath: [], api: childApi }],
  }],
}

describe('createAiApiScriptContext', () => {
  it('coalesces mutator callback into { run } for nested child actions', async () => {
    const editTool = vi.fn(async (run: (tool: { tag: string }) => void) => {
      run({ tag: 'tool' })
    })
    const rawChild = { editTool }
    const openChild = vi.fn(() => rawChild)
    const root = { openChild }
    const scriptContext = createAiApiScriptContext({ instance: root, api: rootApi, ctx: { segments: [] } })
    const open = readScriptContextCallable(scriptContext, 'openChild')
    const child = await open({ childId: 'row-1' })
    expect(child).not.toBe(rawChild)
    const editToolOnChild = readScriptObjectCallable(child, 'editTool')
    const mutator = vi.fn()
    await editToolOnChild(mutator)
    expect(openChild).toHaveBeenCalledWith('row-1')
    expect(editTool).toHaveBeenCalledOnce()
    expect(typeof editTool.mock.calls[0]?.[0]).toBe('function')
    expect(mutator).toHaveBeenCalledWith({ tag: 'tool' })
  })

  it('wraps native object and positional arguments to generated paramsSchema names', async () => {
    const createItem = vi.fn()
    const editTool = vi.fn(async (run: (tool: { createItem: typeof createItem }) => void) => {
      run({ createItem })
    })
    const setLabel = vi.fn()
    const getLabel = vi.fn(() => 'ok')
    const rawChild = { editTool, setLabel, getLabel }
    const root = { openChild: vi.fn(() => rawChild) }
    const scriptContext = createAiApiScriptContext({
      instance: root,
      api: rootApi,
      ctx: { segments: [] },
    })
    const child = await readScriptContextCallable(scriptContext, 'openChild')({ childId: 'row-2' })

    await readScriptObjectCallable(child, 'editTool')(async (tool: { createItem: ScriptCallableForTest }) => {
      tool.createItem({ name: 'item-a', tags: [] })
    })
    readScriptObjectCallable(child, 'setLabel')('label-a')
    const label = readScriptObjectCallable(child, 'getLabel')()

    expect(createItem).toHaveBeenCalledWith({ name: 'item-a', tags: [] })
    expect(setLabel).toHaveBeenCalledWith('label-a')
    expect(label).toBe('ok')
  })

  it('rejects mistaken createItem args passed to editTool via script proxy', async () => {
    const editTool = vi.fn(async () => undefined)
    const scriptContext = createAiApiScriptContext({
      instance: { openChild: vi.fn(() => ({ editTool })) },
      api: rootApi,
      ctx: { segments: [] },
    })
    const child = await readScriptContextCallable(scriptContext, 'openChild')({ childId: 'row-3' })
    await expect(async () => readScriptObjectCallable(child, 'editTool')({
      name: 'bad',
      tags: [],
    })).rejects.toThrow()
    expect(editTool).not.toHaveBeenCalled()
  })
})

describe('executeAiApiAction', () => {
  it('accepts direct callback when paramsSchema requires run', async () => {
    const editTool = vi.fn(async () => undefined)
    const action = readChildAction('editTool')
    const result = await executeAiApiAction({
      target: { editTool },
      action,
      args: () => undefined,
      ctx: { segments: [] },
    })
    expect(result.ok).toBe(true)
    expect(editTool).toHaveBeenCalledOnce()
  })

  it('unwraps { run } object for mutator methods', async () => {
    const editTool = vi.fn(async () => undefined)
    const action = readChildAction('editTool')
    const mutator = vi.fn()
    const result = await executeAiApiAction({
      target: { editTool },
      action,
      args: testAiJsonParams({ run: mutator }),
      ctx: { segments: [] },
    })
    expect(result.ok).toBe(true)
    expect(editTool).toHaveBeenCalledWith(mutator)
  })

  it('rejects non-function run before calling mutator method', async () => {
    const editTool = vi.fn(async () => undefined)
    const action = readChildAction('editTool')
    const result = await executeAiApiAction({
      target: { editTool },
      action,
      args: testAiJsonParams({ run: { name: 'bad' } }),
      ctx: { segments: [] },
    })
    expect(result.ok).toBe(false)
    expect(editTool).not.toHaveBeenCalled()
  })
})

describe('executeAiNativeScript', () => {
  it('runs script directly from VCM metadata without AiAgentHost', async () => {
    const createItem = vi.fn()
    const editTool = vi.fn(async (run: (tool: { createItem: typeof createItem }) => void) => {
      run({ createItem })
    })
    const rawChild = {
      editTool,
      getLabel: vi.fn(() => 'saved'),
    }
    const root = { openChild: vi.fn(() => rawChild) }

    const result = await executeAiNativeScript({
      instance: root,
      metadata: { schemaVersion: 1, rootApi },
      script: [
        'const child = await this.openChild({ childId: "row-4" })',
        'await child.editTool(async (tool) => {',
        '  tool.createItem({ name: "item-b", tags: [] })',
        '})',
        'return { label: await child.getLabel() }',
      ].join('\n'),
    })

    expect(result.ok).toBe(true)
    expect(root.openChild).toHaveBeenCalledWith('row-4')
    expect(createItem).toHaveBeenCalledWith({ name: 'item-b', tags: [] })
    expect(result.data).toEqual({ label: 'saved' })
  })

  it('uses generated schemaDefs while validating nested native API calls', async () => {
    const metadataWithSchemaRef = {
      schemaVersion: 1,
      rootApi: {
        ...rootApi,
        actions: [{
          ...rootApi.actions[0]!,
          resultApis: [{
            resultPath: [],
            api: {
              ...childApi,
              actions: [{
                ...childApi.actions[2]!,
                resultApis: [{
                  resultPath: [],
                  api: {
                    ...toolApi,
                    actions: [{
                      ...toolApi.actions[0]!,
                      paramsSchema: paramsSchema({
                        options: { $ref: '#/$defs/ItemOptions' },
                      }, ['options']),
                    }],
                  },
                }],
              }],
            },
          }],
        }],
      },
    } as const
    const createItem = vi.fn()
    const editTool = vi.fn(async (run: (tool: { createItem: typeof createItem }) => void) => {
      run({ createItem })
    })
    const root = { openChild: vi.fn(() => ({ editTool })) }

    const result = await executeAiNativeScript({
      instance: root,
      metadata: metadataWithSchemaRef,
      schemaDefs: {
        ItemOptions: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            tags: { type: 'array' },
          },
          required: ['name', 'tags'],
          additionalProperties: false,
        },
      },
      script: [
        'const child = await this.openChild({ childId: "row-5" })',
        'await child.editTool(async (tool) => tool.createItem({ name: "item-c", tags: [] }))',
        'return { ok: true }',
      ].join('\n'),
    })

    expect(result.ok).toBe(true)
    expect(createItem).toHaveBeenCalledWith({ name: 'item-c', tags: [] })
  })
})

function readChildAction(name: string) {
  const action = childApi.actions.find(candidate => candidate.name === name)
  if (action === undefined) throw new Error(`missing test action ${name}`)
  return action
}

function readScriptContextCallable(
  context: Readonly<Record<string, unknown>>,
  name: string,
): ScriptCallableForTest {
  const fn = context[name]
  if (!isScriptCallable(fn)) {
    throw new Error(`${name} is not callable in script context`)
  }
  return fn
}

function readScriptObjectCallable(value: unknown, name: string): ScriptCallableForTest {
  if (!isRecord(value)) {
    throw new Error('expected script proxy object')
  }
  return readScriptContextCallable(value, name)
}

function isScriptCallable(value: unknown): value is ScriptCallableForTest {
  return typeof value === 'function'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function testAiJsonParams(record: Record<string, unknown>): AiJsonParams {
  return isAiJsonParams(record) ? record : {}
}

function isAiJsonParams(value: unknown): value is AiJsonParams {
  return isRecord(value)
}
