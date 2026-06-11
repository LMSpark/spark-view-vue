import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createClassModelDocumentFromRuntimeDocument,
  listAttributeReachableKinds,
  projectClassModelForGuide,
  VCM_NATIVE_TOOL_NAMES,
  VcmNativeRuntime,
  createVcmNativeKnowledgeWorkerApi,
} from '../index'
import { renderAttributeTypeText } from '../class-model/signature-renderer'

const root = resolve(import.meta.dirname, '../../../../..')

describe('vcm-native ClassModel projection', () => {
  it('defines the seven VCM-native OpenAI tool names outside ClassModel methods', () => {
    expect(Object.values(VCM_NATIVE_TOOL_NAMES)).toEqual([
      'vcm_query',
      'vcm_model_guide',
      'vcm_attribute_guide',
      'vcm_action_guide',
      'vcm_script',
      'human_question',
      'agent_complete',
    ])
  })

  it('lists reachable classNames along submodel field chain only', () => {
    const document = createDemoDocument()
    expect([...listAttributeReachableKinds(document)].sort()).toEqual(['DemoChild', 'DemoParent'])
    expect(() => projectClassModelForGuide(document, 'DemoChild')).not.toThrow()
    expect(() => projectClassModelForGuide(document, 'OrphanModel')).toThrow(/submodel field chain/)
  })

  it('runs the seven VCM-native tool handlers against inline ClassModel document', async () => {
    const document = createDemoDocument()
    const scriptCommands: unknown[] = []
    const runtime = new VcmNativeRuntime({
      document,
      scriptExecutor: async (command) => {
        scriptCommands.push(command)
        return { executed: true, script: command.script }
      },
    })

    expect(runtime.getTools().map(tool => tool.function.name)).toEqual([
      'vcm_query',
      'vcm_model_guide',
      'vcm_attribute_guide',
      'vcm_action_guide',
      'vcm_script',
      'human_question',
      'agent_complete',
    ])

    const query = await runtime.executeTool('vcm_query', { className: 'DemoParent', includeMembers: true })
    expect(query.ok).toBe(true)
    expect(JSON.stringify(query.data)).toContain('DemoParent')

    const methodGuide = await runtime.executeTool('vcm_action_guide', {
      className: 'DemoParent',
      actionName: 'save',
    })
    expect(methodGuide.ok).toBe(true)
    expect(JSON.stringify(methodGuide.data)).toContain('save')

    expect(await runtime.executeTool('vcm_script', { script: 'return true' })).toMatchObject({
      ok: true,
      data: { executed: true, script: 'return true' },
    })
    expect(scriptCommands).toHaveLength(1)

    expect(await runtime.executeTool('agent_complete', { summary: '已完成' })).toMatchObject({
      ok: true,
      data: { completed: true, summary: '已完成' },
      state: { agentLifecycle: 'complete', finalAssistantMessage: '已完成' },
    })
  })

  it('keeps runtime execution separate from injectable knowledge lookup', async () => {
    const knowledgeCalls: string[] = []
    const host = { pageId: 'page-a' }
    const runtime = new VcmNativeRuntime({
      knowledge: {
        query: (input) => {
          knowledgeCalls.push(`query:${input.keyword ?? ''}`)
          return { rootClassName: 'DemoParent', models: [{ className: 'DemoParent' }] }
        },
        modelGuide: (input) => {
          knowledgeCalls.push(`model:${input.className}`)
          return `class ${input.className}`
        },
        attributeGuide: (input) => {
          knowledgeCalls.push(`attribute:${input.className}.${input.attributeName}`)
          return `${input.attributeName}: string`
        },
        methodGuide: (input) => {
          knowledgeCalls.push(`method:${input.className}.${input.methodName}`)
          return `${input.methodName}()`
        },
      },
      scriptExecutor: (command) => ({
        hostIsSameObject: command.host === host,
        script: command.script,
      }),
    })

    expect(await runtime.executeTool('vcm_query', { keyword: 'demo' })).toMatchObject({
      ok: true,
      data: { models: [{ className: 'DemoParent' }] },
    })
    expect(await runtime.executeTool('vcm_action_guide', {
      className: 'DemoParent',
      actionName: 'save',
    })).toMatchObject({ ok: true, data: 'save()' })
    expect(await runtime.executeTool('vcm_script', { script: 'return true' }, host)).toMatchObject({
      ok: true,
      data: { hostIsSameObject: true, script: 'return true' },
    })
    expect(knowledgeCalls).toEqual(['query:demo', 'method:DemoParent.save'])
  })

  it('rejects legacy module_* tool names as unknown VCM-native tools', async () => {
    const runtime = new VcmNativeRuntime({
      knowledge: {
        query: () => ({ rootClassName: 'DemoParent', models: [] }),
        modelGuide: () => 'class DemoParent {}',
        attributeGuide: () => 'rows: DemoChild[]',
        methodGuide: () => 'save()',
      },
      scriptExecutor: (command) => command.script,
    })

    await expect(runtime.executeTool('module_find', { className: 'DemoParent' })).resolves.toMatchObject({
      ok: false,
      checks: [expect.objectContaining({
        code: 'UNKNOWN_VCM_NATIVE_TOOL',
        message: expect.stringContaining('module_find'),
      })],
    })
  })

  it('rejects old path/direct-call aliases at runtime', async () => {
    const runtime = new VcmNativeRuntime({
      knowledge: {
        query: () => ({ rootClassName: 'DemoParent', models: [] }),
        modelGuide: () => 'class DemoParent {}',
        attributeGuide: () => 'rows: DemoChild[]',
        methodGuide: () => 'save()',
      },
      scriptExecutor: (command) => command.script,
    })

    await expect(runtime.executeTool('vcm_script', {
      code: 'return true',
      path: '/DemoParent[demo]',
    })).resolves.toMatchObject({
      ok: false,
      checks: [expect.objectContaining({
        code: 'INVALID_VCM_NATIVE_TOOL_ARGS',
        message: expect.stringContaining('code, path'),
      })],
    })

    await expect(runtime.executeTool('vcm_action_guide', {
      className: 'DemoParent',
      methodName: 'save',
    })).resolves.toMatchObject({
      ok: false,
      checks: [expect.objectContaining({
        code: 'INVALID_VCM_NATIVE_TOOL_ARGS',
        message: expect.stringContaining('methodName'),
      })],
    })
  })

  it('fails worker init with spark-json-document missing $defs audit', async () => {
    const api = createVcmNativeKnowledgeWorkerApi({
      fetchJson: async () => ({
        $defs: {},
        modules: [{
          rootApi: {
            kind: 'DemoParent',
            className: 'DemoParent',
            name: 'DemoParent',
            description: 'parent',
            jsdoc: '/** parent */',
            actions: [],
            attributes: [{
              name: 'broken',
              description: 'Broken',
              jsdoc: '/** Broken */',
              schema: { $ref: '#/$defs/MissingType' },
              readable: true,
              writable: false,
            }],
          },
        }],
      }),
    })

    await expect(api.init({ metadataUrl: 'metadata://broken' })).rejects.toThrow('MissingType')
  })

  it('keeps Comlink client on main thread without schema or metadata imports', () => {
    const moduleText = readFileSync(
      resolve(root, 'packages/spark-ai/src/vcm-native/knowledge/worker-knowledge-client.ts'),
      'utf8',
    )

    expect(moduleText).toContain("from 'comlink'")
    expect(moduleText).not.toContain('@spark-appworks/spark-json-document')
    expect(moduleText).not.toContain('page-design-module-metadata.runtime.generated.json')
  })

  it('keeps spark-json-document on worker handler side', () => {
    const moduleText = readFileSync(
      resolve(root, 'packages/spark-ai/src/vcm-native/knowledge/worker-knowledge-handler.ts'),
      'utf8',
    )

    expect(moduleText).toContain('@spark-appworks/spark-json-document')
    expect(moduleText).toContain('findMissingJsonSchemaDefRefs')
  })

  it('renders array child-model attributes as ElementClassName[] in guide type text', () => {
    const document = createDemoDocument()
    const model = projectClassModelForGuide(document, 'DemoParent')
    const attribute = model.attributes.find(item => item.name === 'rows')
    expect(attribute).toBeDefined()
    expect(renderAttributeTypeText(document, 'DemoParent', attribute!)).toBe('DemoChild[]')
  })
})

function createDemoDocument() {
  return createClassModelDocumentFromRuntimeDocument({
    modules: [{
      schemaVersion: 2,
      rootApi: {
        kind: 'DemoParent',
        className: 'DemoParent',
        name: 'DemoParent',
        description: 'parent',
        jsdoc: '/** Demo parent model. */',
        actions: [{
          name: 'save',
          methodName: 'save',
          description: 'Persist parent state.',
          jsdoc: '/** Persist parent state. */',
          paramsSchema: { type: 'object', properties: {}, required: [] },
        }],
        attributes: [{
          name: 'rows',
          description: 'Child rows.',
          jsdoc: '/** Child rows. */',
          schema: { type: 'array', items: { $ref: '#/$defs/DemoChild' } },
          readable: true,
          writable: false,
          api: {
            kind: 'DemoChild',
            className: 'DemoChild',
            name: 'DemoChild',
            description: 'child',
            jsdoc: '/** Demo child model. */',
            actions: [],
          },
        }],
      },
      apiRegistry: {
        DemoChild: {
          kind: 'DemoChild',
          className: 'DemoChild',
          name: 'DemoChild',
          description: 'child',
          jsdoc: '/** Demo child model. */',
          actions: [],
        },
      },
    }],
  })
}
