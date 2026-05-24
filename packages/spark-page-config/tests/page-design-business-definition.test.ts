import { describe, expect, it } from 'vitest'

import {
  AiHostBusinessRegistry,
  AiHostToolLoopRunner,
  createAiHostBusinessTask,
  startRegistrationSession,
  toAiHostRuntimeScope,
  type AiHostBusinessRuntimeContext,
  type AiHostTransport,
} from '@spark-view/spark-ai/host'
import {
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessKindDefinition,
  createPageDesignBusinessRegistration,
  registerPageDesignBusiness,
} from '@spark-view/spark-page-config/ai'
import type { PageDesignEditHost } from '@spark-view/spark-page-config/design'
import { SparkNodeTree } from '@spark-view/spark-page-config/node-tree'
import { DataSetCrudTool } from '@spark-view/spark-data'
import { PageDesignService } from '../src/design/page-design-service'
import { isRecord } from '@spark-view/spark-page-config/json-document'

function resultItemCount(value: unknown): number {
  if (!isRecord(value) || !Array.isArray(value['items'])) return 0
  return value['items'].length
}

function resultStepCount(value: unknown): number {
  if (!isRecord(value) || !Array.isArray(value['steps'])) return 0
  return value['steps'].length
}

function createHost(options: { script?: string; style?: string } = {}): {
  host: PageDesignEditHost
  reads: () => { script: string; style: string; nodeChanged: number; dataChanged: number }
} {
  let script = options.script ?? 'export default {}'
  let style = options.style ?? '.page { color: red; }'
  let nodeChanged = 0
  let dataChanged = 0
  const nodeTree = SparkNodeTree.fromJson({ type: 'page', props: {}, children: [] })
  const dataSetTool = new DataSetCrudTool('page-design-test')
  return {
    host: {
      getNodeTree: () => nodeTree,
      onNodeTreeChanged: () => { nodeChanged += 1 },
      getDataSetTool: () => dataSetTool,
      onDataSetChanged: () => { dataChanged += 1 },
      readScript: () => script,
      writeScript: (content) => { script = content },
      readStyle: () => style,
      writeStyle: (content) => { style = content },
    },
    reads: () => ({ script, style, nodeChanged, dataChanged }),
  }
}

function hostContext(pageId: string): AiHostBusinessRuntimeContext {
  return {
    moduleId: PAGE_DESIGN_MODULE_ID,
    moduleInstanceId: pageId,
    instanceId: pageId,
  }
}

function businessScope(pageId: string) {
  return {
    businessRegistrationId: PAGE_DESIGN_MODULE_ID,
    businessInstanceId: pageId,
    instanceId: pageId,
    runtimeInstanceId: pageId,
  }
}

function testTurn() {
  return {
    turnId: 'turn-page-design-submodule',
    seq: 1,
    baseRevision: 0,
    queuedAt: '2026-05-21T00:00:00.000Z',
    startedAt: '2026-05-21T00:00:00.000Z',
    maxParallelTurns: 1,
  }
}

function getRecord(result: { readonly ok: boolean; readonly data?: unknown }): Record<string, unknown> {
  if (!result.ok || !isRecord(result.data)) {
    throw new Error('expected ok record')
  }
  return result.data
}

function getArray(result: { readonly ok: boolean; readonly data?: unknown }): unknown[] {
  if (!result.ok || !Array.isArray(result.data)) {
    throw new Error('expected ok array')
  }
  return result.data
}

function expectActionMetadataComplete(describeData: Record<string, unknown>): void {
  const actions = describeData['actions']
  if (!Array.isArray(actions)) throw new Error('actions not array')
  for (const action of actions) {
    if (!isRecord(action)) throw new Error('action not record')
    expect(action).toHaveProperty('paramsSchema')
    expect(action).toHaveProperty('resultSchema')
    expect(action).toHaveProperty('usageRules')
    expect(action).toHaveProperty('failureModes')
    expect(action).toHaveProperty('example')
  }
}

function actionNames(describeData: Record<string, unknown>): string[] {
  const actions = describeData['actions']
  if (!Array.isArray(actions)) throw new Error('actions not array')
  return actions.map((action) => isRecord(action) && typeof action['name'] === 'string' ? action['name'] : '')
}

describe('pageDesign host business registration', () => {
  it('lets the page-design service be manually orchestrated without an AI session', async () => {
    const { host, reads } = createHost()
    const service = new PageDesignService({ getEditHost: () => host })
    const context = {
      pageId: 'manual-page',
      requestId: 'manual-run',
    }

    expect(service.bootstrap(context)).toMatchObject({ ok: true, data: { phase: 'editing' } })
    expect(service.readTextModel(context, 'script')).toMatchObject({ ok: true, data: { content: 'export default {}' } })
    expect(service.writeTextModel(context, 'script', 'export default { manual: true }')).toMatchObject({ ok: true })
    expect(reads().script).toBe('export default { manual: true }')

    const counted = await service.runNodeTreeAction(context, {}, {
      serviceLabel: 'countNodes',
      mutates: false,
      run: (tree) => tree.countNodes(),
    })
    expect(counted).toMatchObject({ ok: true, data: 1 })
    expect(service.getState(context).phase).toBe('editing')
  })

  it('registers pageDesign as root kind with five child module-semantic kinds', async () => {
    const { host } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext('page-designer')
    const started = await startRegistrationSession(registration, context)

    expect(registration.moduleId).toBe(PAGE_DESIGN_MODULE_ID)
    expect(registration.description).toBe('单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。')
    expect(started.tools.map((tool) => tool.function.name)).toEqual([
      'queryModules',
      'queryFunctions',
      'guideFunction',
      'guideHumanQuestion',
      'getAttribute',
      'setAttribute',
      'invokeAction',
      'listChildren',
      'findInstance',
      'describeKind',
    ])

    const listed = await registration.runtime.executeTool('listChildren', { path: '/' }, context)
    const ids = getArray(listed).map((entry) => isRecord(entry) ? entry['id'] : null)
    expect(ids).toEqual([PAGE_DESIGN_MODULE_ID])

    const rootFound = await registration.runtime.executeTool('findInstance', {
      path: '/',
      childKind: PAGE_DESIGN_MODULE_ID,
      query: {},
    }, context)
    const rootInstances = getArray(rootFound)
    const rootInstance = rootInstances[0]
    expect(isRecord(rootInstance) ? rootInstance['id'] : null).toBe('page-designer')

    const rootDescription = getRecord(await registration.runtime.executeTool('describeKind', {
      kind: PAGE_DESIGN_MODULE_ID,
    }, context))
    expect(rootDescription['children']).toEqual(['lifecycle', 'text-model', 'payload-catalog', 'node-tree', 'dataset'])

    const childRefs = getArray(await registration.runtime.executeTool('listChildren', {
      path: '/pageDesign[page-designer]',
    }, context))
    expect(childRefs).toHaveLength(5)

    for (const kind of ['lifecycle', 'text-model', 'payload-catalog', 'node-tree', 'dataset']) {
      const found = await registration.runtime.executeTool('findInstance', {
        path: '/pageDesign[page-designer]',
        childKind: kind,
        query: {},
      }, context)
      const instances = getArray(found)
      expect(isRecord(instances[0]) ? instances[0]['id'] : null).toBe('page-designer')

      const described = await registration.runtime.executeTool('describeKind', { kind }, context)
      const description = getRecord(described)
      expect(description['parentKind']).toBe(PAGE_DESIGN_MODULE_ID)
      expectActionMetadataComplete(description)
    }

    const payloadDescription = getRecord(await registration.runtime.executeTool('describeKind', {
      kind: 'payload-catalog',
    }, context))
    expect(actionNames(payloadDescription)).toEqual(['queryPayloads', 'guidePayload'])

    const nodeTreeDescription = getRecord(await registration.runtime.executeTool('describeKind', {
      kind: 'node-tree',
    }, context))
    expect(nodeTreeDescription['payloads']).toEqual([
      {
        payloadRef: 'spark.component',
        description: 'SparkNode 组件 props 参数目录；LLM 写目录组件前必须显式 guidePayload，node-tree 写入时也会按 type 自动提取指南并兜底校验 props。',
        requiredForActions: ['addNode', 'addNodes', 'replaceNode', 'replaceNodes', 'setProps', 'setPropsBatch'],
      },
    ])
  })

  it('exposes a page-config owned pageDesign business registration helper', () => {
    const { host } = createHost()
    const registry = new AiHostBusinessRegistry()

    registerPageDesignBusiness({
      registry,
      getPageDesignEditHost: () => host,
    })

    const registration = registry.get(PAGE_DESIGN_MODULE_ID)
    expect(registration?.moduleId).toBe(PAGE_DESIGN_MODULE_ID)
    expect(registration?.runtime.describeKind(PAGE_DESIGN_MODULE_ID).ok).toBe(true)
    expect(registration?.inputContract?.identityField).toBe('pageId')
    expect(registry.list()).toHaveLength(1)
  })

  it('creates pageDesign task through registered inputContract instead of a bare target', () => {
    const { host } = createHost()
    const definition = createPageDesignBusinessKindDefinition({ getEditToolHost: () => host })
    const registry = new AiHostBusinessRegistry()
    registry.register(createPageDesignBusinessRegistration({ getEditToolHost: () => host }))

    expect(definition.kindID).toBe(PAGE_DESIGN_MODULE_ID)
    expect(definition.inputContract.identityField).toBe('pageId')

    const task = createAiHostBusinessTask(registry, PAGE_DESIGN_MODULE_ID, {
      pageId: ' page-designer ',
      userRequirement: '  实现请假申请页面  ',
    })
    const request = task.toChatRequest()

    expect(task.target.businessRegistrationId).toBe(PAGE_DESIGN_MODULE_ID)
    expect(task.target.businessInstanceId).toBe('page-designer')
    expect(task.normalizedInput).toMatchObject({
      pageId: 'page-designer',
      userRequirement: '实现请假申请页面',
    })
    expect(request.historyMsgs).toEqual([{ role: 'user', content: '实现请假申请页面' }])
    expect(request.systemPrompt).toContain('AI Host: registered business task')
    expect(request.systemPrompt).toContain('kindID: pageDesign')
    expect(request.systemPrompt).toContain('"pageId":"page-designer"')
    expect(request.systemPrompt).toContain('inputContract 已校验输入')
    expect(request.systemPrompt).toContain('describeProgress')
    expect(request.systemPrompt).toContain('describeDesignFlow')
    expect(request.systemPrompt).toContain('不要主动调用 bootstrap')
  })

  it('rejects pageDesign task inputs that do not satisfy the registered schema', () => {
    const { host } = createHost()
    const registry = new AiHostBusinessRegistry()
    registry.register(createPageDesignBusinessRegistration({ getEditToolHost: () => host }))

    expect(() => createAiHostBusinessTask(registry, PAGE_DESIGN_MODULE_ID, {
      pageId: 'page-designer',
    })).toThrow('failed schema validation')
  })

  it('executes lifecycle/text-model/payload-catalog/node-tree/dataset through protocol tools', async () => {
    const { host, reads } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext('page-designer')
    await startRegistrationSession(registration, context)

    const bootstrap = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/lifecycle[page-designer]',
      actionName: 'bootstrap',
      args: {},
    }, context)
    expect(bootstrap).toMatchObject({ ok: true, data: { phase: 'editing' } })

    const designFlow = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/lifecycle[page-designer]',
      actionName: 'describeDesignFlow',
      args: { phase: '入口', afterStep: 10 },
    }, context)
    expect(resultStepCount(getRecord(designFlow))).toBe(10)

    const writeScript = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/text-model[page-designer]',
      actionName: 'writeScript',
      args: { content: 'export default { mounted() {} }' },
    }, context)
    expect(writeScript.ok).toBe(true)
    expect(reads().script).toBe('export default { mounted() {} }')

    const longSignatureScript = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/text-model[page-designer]',
      actionName: 'writeScript',
      args: { content: 'function handleSubmit(form, row, table, page) { return form }' },
    }, context)
    expect(longSignatureScript.ok).toBe(false)
    expect(longSignatureScript.checks?.[0]?.code).toBe('INVALID_SCRIPT_RUNTIME_API')
    expect(longSignatureScript.checks?.[0]?.message).toContain('长位置参数函数签名')
    expect(reads().script).toBe('export default { mounted() {} }')

    const readScript = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/text-model[page-designer]',
      actionName: 'readScript',
      args: {},
    }, context)
    expect(readScript).toMatchObject({ ok: true, data: { content: 'export default { mounted() {} }' } })

    const payloads = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/payload-catalog[page-designer]',
      actionName: 'queryPayloads',
      args: { key: 'r-button', limit: 1 },
    }, context)
    const payloadCatalog = getRecord(payloads)
    expect(payloadCatalog).toMatchObject({
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
    })
    expect(resultItemCount(payloadCatalog)).toBe(1)
    const payloadItems = payloadCatalog['items']
    if (!Array.isArray(payloadItems) || !isRecord(payloadItems[0])) throw new Error('expected payload item')
    expect(payloadItems[0]['key']).toBe('r-button')
    expect(payloadItems[0]['moduleKind']).toBe('node-tree')
    expect(payloadItems[0]['payloadRef']).toBe('spark.component')

    const payloadGuide = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/payload-catalog[page-designer]',
      actionName: 'guidePayload',
      args: { key: 'r-button' },
    }, context)
    const payloadGuideData = getRecord(payloadGuide)
    expect(payloadGuideData).toMatchObject({
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
    })
    const guidedPayload = payloadGuideData['payload']
    if (!isRecord(guidedPayload)) throw new Error('expected payload guide record')
    expect(guidedPayload['key']).toBe('r-button')
    expect(guidedPayload['moduleKind']).toBe('node-tree')
    expect(guidedPayload['payloadRef']).toBe('spark.component')
    const paramsSchema = guidedPayload['paramsSchema']
    if (!isRecord(paramsSchema) || !isRecord(paramsSchema['properties'])) {
      throw new Error('expected payload paramsSchema properties')
    }
    expect(paramsSchema['type']).toBe('object')
    expect(paramsSchema['properties']).toHaveProperty('action')
    expect(paramsSchema['properties']).toHaveProperty('label')

    const displayPayloads = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/payload-catalog[page-designer]',
      actionName: 'queryPayloads',
      args: { key: 'display-statistic', limit: 1 },
    }, context)
    expect(resultItemCount(getRecord(displayPayloads))).toBe(1)

    const displayGuide = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/payload-catalog[page-designer]',
      actionName: 'guidePayload',
      args: { key: 'display-statistic' },
    }, context)
    expect(displayGuide.ok).toBe(true)

    const recommendedFields = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/payload-catalog[page-designer]',
      actionName: 'queryPayloads',
      args: { category: 'field', configurableOnly: true, limit: 5 },
    }, context)
    const recommendedFieldCatalog = getRecord(recommendedFields)
    const fieldItems = recommendedFieldCatalog['items']
    if (!Array.isArray(fieldItems)) throw new Error('expected recommended field items')
    expect(fieldItems.map((item) => isRecord(item) ? item['key'] : null)).toEqual([
      'r-text',
      'r-select',
      'r-date',
      'r-number',
      'r-textarea',
    ])
    expect(fieldItems.every((item) => isRecord(item) && item['configurable'] === true)).toBe(true)

    const countNodes = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/node-tree[page-designer]',
      actionName: 'countNodes',
      args: {},
    }, context)
    expect(countNodes).toMatchObject({ ok: true, data: 1 })

    const listTables = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/dataset[page-designer]',
      actionName: 'listTables',
      args: {},
    }, context)
    expect(listTables).toMatchObject({ ok: true, data: [] })
  })

  it('enforces data-first node writes and requires guides for every written component', async () => {
    const { host } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext('page-designer')
    await startRegistrationSession(registration, context)

    const addBeforeDataset = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/node-tree[page-designer]',
      actionName: 'addNode',
      args: {
        parentComponentId: 'page__0',
        node: {
          type: 'r-form',
          id: 'guided-form',
          props: { dataViewKey: 'LeaveRequest@default', contextDataMember: 'currentRow' },
          children: [
            { type: 'r-text', id: 'guided-name', props: { field: 'applicantName' } },
          ],
        },
      },
    }, context)
    expect(addBeforeDataset.ok).toBe(false)
    if (addBeforeDataset.ok) throw new Error('expected data-first failure')
    expect(JSON.stringify(addBeforeDataset.checks ?? [])).toContain('DATASET_FIRST_REQUIRED')

    const createDataset = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/dataset[page-designer]',
      actionName: 'createTable',
      args: {
        tableName: 'LeaveRequest',
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'applicantName', type: 'string' },
        ],
        resourceType: 'database-table',
        resourceId: 'hr.leave_request',
        views: { default: {} },
      },
    }, context)
    expect(createDataset.ok).toBe(true)

    const addInvalidProps = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/node-tree[page-designer]',
      actionName: 'addNode',
      args: {
        parentComponentId: 'page__0',
        node: {
          type: 'r-form',
          id: 'guided-form',
          props: { dataViewKey: 'LeaveRequest@default', contextDataMember: 'currentRow', gridColumns: 'two' },
          children: [
            { type: 'r-text', id: 'guided-name', props: { field: 'applicantName' } },
          ],
        },
      },
    }, context)
    expect(addInvalidProps.ok).toBe(false)
    if (addInvalidProps.ok) throw new Error('expected payload schema failure')
    const invalidPropsChecks = JSON.stringify(addInvalidProps.checks ?? [])
    expect(invalidPropsChecks).toContain('NODE_PAYLOAD_SCHEMA_INVALID')
    expect(invalidPropsChecks).toContain('gridColumns')

    const addWithAutoGuides = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/node-tree[page-designer]',
      actionName: 'addNode',
      args: {
        parentComponentId: 'page__0',
        node: {
          type: 'r-form',
          id: 'guided-form',
          props: { dataViewKey: 'LeaveRequest@default', contextDataMember: 'currentRow' },
          children: [
            { type: 'r-text', id: 'guided-name', props: { field: 'applicantName' } },
          ],
        },
      },
    }, context)
    expect(addWithAutoGuides.ok).toBe(true)

    const addNativeType = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/node-tree[page-designer]',
      actionName: 'addNode',
      args: {
        parentComponentId: 'page__0',
        node: {
          type: 'div',
          id: 'native-wrapper',
          props: {},
          children: ['原生说明文案'],
        },
      },
    }, context)
    expect(addNativeType.ok).toBe(true)

    const addDisplayCatalogType = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/node-tree[page-designer]',
      actionName: 'addNode',
      args: {
        parentComponentId: 'page__0',
        node: {
          type: 'display-statistic',
          id: 'display-statistic-node',
          props: { title: '待审批申请' },
        },
      },
    }, context)
    expect(addDisplayCatalogType.ok).toBe(true)

    const addUnknownType = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/node-tree[page-designer]',
      actionName: 'addNode',
      args: {
        parentComponentId: 'page__0',
        node: {
          type: 'mystery-widget',
          id: 'unknown-widget',
          props: {},
        },
      },
    }, context)
    expect(addUnknownType).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'UNKNOWN_NODE_TYPE' })],
    })
  })

  it('requires contextDataMember when form nodes bind a DataView', async () => {
    const { host } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const context = hostContext('page-designer')
    await startRegistrationSession(registration, context)

    const createDataset = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/dataset[page-designer]',
      actionName: 'createTable',
      args: {
        tableName: 'LeaveRequest',
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'applicantName', type: 'string' },
        ],
        resourceType: 'database-table',
        resourceId: 'hr.leave_request',
        views: { default: {} },
      },
    }, context)
    expect(createDataset.ok).toBe(true)

    for (const key of ['r-form', 'r-text']) {
      const guide = await registration.runtime.executeTool('invokeAction', {
        path: '/pageDesign[page-designer]/payload-catalog[page-designer]',
        actionName: 'guidePayload',
        args: { key },
      }, context)
      expect(guide.ok).toBe(true)
    }

    const missingContext = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/node-tree[page-designer]',
      actionName: 'addNode',
      args: {
        parentComponentId: 'page__0',
        node: {
          type: 'r-form',
          id: 'form-without-context',
          props: { dataViewKey: 'LeaveRequest@default' },
          children: [
            { type: 'r-text', id: 'field-name', props: { field: 'applicantName' } },
          ],
        },
      },
    }, context)
    expect(missingContext.ok).toBe(false)
    if (missingContext.ok) throw new Error('expected contextDataMember failure')
    expect(JSON.stringify(missingContext.checks ?? [])).toContain('CONTEXT_DATA_MEMBER_REQUIRED')
  })

  it('AI tool loop can discover child modules and invoke payload guides through nested paths', async () => {
    const pageId = 'page-designer'
    const { host, reads } = createHost()
    const registration = createPageDesignBusinessRegistration({ getEditToolHost: () => host })
    const scope = businessScope(pageId)
    const context = hostContext(pageId)
    await startRegistrationSession(registration, context)

    const statuses: string[] = []
    const roundToolNames: string[][] = []
    let streamRound = 0
    const transport: AiHostTransport = {
      streamTurn: (input) => {
        roundToolNames.push(input.tools.map((tool) => tool.function.name))
        streamRound += 1
        if (streamRound === 1) {
          return Promise.resolve({
            text: '',
            toolCalls: [
              {
                id: 'discover-root',
                type: 'function',
                function: {
                  name: 'listChildren',
                  arguments: JSON.stringify({ path: '/' }),
                },
              },
              {
                id: 'find-root',
                type: 'function',
                function: {
                  name: 'findInstance',
                  arguments: JSON.stringify({ path: '/', childKind: PAGE_DESIGN_MODULE_ID, query: {} }),
                },
              },
            ],
          })
        }
        if (streamRound === 2) {
          return Promise.resolve({
            text: '',
            toolCalls: [
              {
                id: 'discover-child',
                type: 'function',
                function: {
                  name: 'listChildren',
                  arguments: JSON.stringify({ path: `/pageDesign[${pageId}]` }),
                },
              },
              {
                id: 'find-child',
                type: 'function',
                function: {
                  name: 'findInstance',
                  arguments: JSON.stringify({
                    path: `/pageDesign[${pageId}]`,
                    childKind: 'text-model',
                    query: {},
                  }),
                },
              },
              {
                id: 'find-payload-catalog',
                type: 'function',
                function: {
                  name: 'findInstance',
                  arguments: JSON.stringify({
                    path: `/pageDesign[${pageId}]`,
                    childKind: 'payload-catalog',
                    query: {},
                  }),
                },
              },
              {
                id: 'describe-child',
                type: 'function',
                function: {
                  name: 'describeKind',
                  arguments: JSON.stringify({ kind: 'text-model' }),
                },
              },
              {
                id: 'describe-payload-catalog',
                type: 'function',
                function: {
                  name: 'describeKind',
                  arguments: JSON.stringify({ kind: 'payload-catalog' }),
                },
              },
            ],
          })
        }
        if (streamRound === 3) {
          return Promise.resolve({
            text: '',
            toolCalls: [
              {
                id: 'query-payloads',
                type: 'function',
                function: {
                  name: 'invokeAction',
                  arguments: JSON.stringify({
                    path: `/pageDesign[${pageId}]/payload-catalog[${pageId}]`,
                    actionName: 'queryPayloads',
                    args: { key: 'r-button', limit: 1 },
                  }),
                },
              },
              {
                id: 'guide-payload',
                type: 'function',
                function: {
                  name: 'invokeAction',
                  arguments: JSON.stringify({
                    path: `/pageDesign[${pageId}]/payload-catalog[${pageId}]`,
                    actionName: 'guidePayload',
                    args: { key: 'r-button' },
                  }),
                },
              },
              {
                id: 'invoke-child',
                type: 'function',
                function: {
                  name: 'invokeAction',
                  arguments: JSON.stringify({
                    path: `/pageDesign[${pageId}]/text-model[${pageId}]`,
                    actionName: 'writeScript',
                    args: { content: 'export default { aiSubmoduleAddressed: true }' },
                  }),
                },
              },
            ],
          })
        }
        return Promise.resolve({ text: 'done', toolCalls: [] })
      },
      appendMessages: () => Promise.resolve(),
    }
    const runner = new AiHostToolLoopRunner({
      registry: { get: () => registration, list: () => [registration] },
      transport,
      maxToolRounds: 4,
    })

    await runner.runToolLoop({
      registration,
      scope,
      request: { historyMsgs: [], onFcCall: (record) => statuses.push(record.status) },
      turn: testTurn(),
      clearSelected: () => undefined,
    })

    expect(roundToolNames).toHaveLength(4)
    expect(roundToolNames[0]).toContain('invokeAction')
    expect(statuses).toEqual([
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
    ])
    expect(reads().script).toBe('export default { aiSubmoduleAddressed: true }')

    const history = registration.sessionStore?.getSessionHistory(context) ?? []
    const functionCalls = history.filter((entry) => entry.kind === 'functionCall')
    expect(functionCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toolName: 'invokeAction',
        status: 'completed',
        args: {
          path: `/pageDesign[${pageId}]/payload-catalog[${pageId}]`,
          actionName: 'queryPayloads',
          args: { key: 'r-button', limit: 1 },
        },
      }),
      expect.objectContaining({
        toolName: 'invokeAction',
        status: 'completed',
        args: {
          path: `/pageDesign[${pageId}]/payload-catalog[${pageId}]`,
          actionName: 'guidePayload',
          args: { key: 'r-button' },
        },
      }),
    ]))
    expect(functionCalls.at(-1)).toMatchObject({
      kind: 'functionCall',
      toolName: 'invokeAction',
      status: 'completed',
      args: {
        path: `/pageDesign[${pageId}]/text-model[${pageId}]`,
        actionName: 'writeScript',
      },
    })
  })

  it('fails fast when live adapter is missing', async () => {
    const registration = createPageDesignBusinessRegistration({
      getEditToolHost: () => ({
        readScript: () => '',
        readStyle: () => '',
      }),
    })
    const context = hostContext('page-designer')
    await expect(startRegistrationSession(registration, context)).rejects.toThrow('PageDesignService.bootstrap')
  })

  it('isolates parallel page-design instances and accepts route-like page ids', async () => {
    const pageA = createHost({ script: 'export default { page: "A" }' })
    const pageB = createHost({ script: 'export default { page: "B" }' })
    const registration = createPageDesignBusinessRegistration({
      getEditToolHost: (context) => context.moduleInstanceId === 'page-a' ? pageA.host : pageB.host,
    })

    const contextA = hostContext('page-a')
    const contextB = hostContext('page-b')
    await startRegistrationSession(registration, contextA)
    await startRegistrationSession(registration, contextB)

    await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-a]/lifecycle[page-a]',
      actionName: 'bootstrap',
      args: {},
    }, contextA)
    await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-b]/lifecycle[page-b]',
      actionName: 'bootstrap',
      args: {},
    }, contextB)
    await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-a]/text-model[page-a]',
      actionName: 'writeScript',
      args: { content: 'export default { page: "A", changed: true }' },
    }, contextA)

    expect(pageA.reads().script).toBe('export default { page: "A", changed: true }')
    expect(pageB.reads().script).toBe('export default { page: "B" }')

    const nestedContext = hostContext('lmspark/homepage')
    await startRegistrationSession(registration, nestedContext)
    const nestedBootstrap = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[lmspark/homepage]/lifecycle[lmspark/homepage]',
      actionName: 'bootstrap',
      args: {},
    }, nestedContext)

    expect(nestedBootstrap).toMatchObject({ ok: true, data: { phase: 'editing' } })
    expect(toAiHostRuntimeScope({
      businessRegistrationId: PAGE_DESIGN_MODULE_ID,
      businessInstanceId: 'lmspark/homepage',
      instanceId: 'lmspark/homepage',
      runtimeInstanceId: 'lmspark/homepage',
    })).toEqual(nestedContext)
  })
})


