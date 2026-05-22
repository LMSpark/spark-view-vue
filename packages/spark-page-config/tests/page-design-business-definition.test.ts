import { describe, expect, it } from 'vitest'

import {
  startRegistrationSession,
  toAiHostRuntimeScope,
  type AiHostBusinessRuntimeContext,
} from '@spark-view/spark-ai/host'
import {
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessRegistration,
} from '@spark-view/spark-page-config/ai'
import type { PageDesignEditHost } from '@spark-view/spark-page-config/design'
import {
  PageDesignService,
} from '@spark-view/spark-page-config/design'
import { SparkNodeTree } from '@spark-view/spark-page-config/node-tree'
import { DataSetCrudTool } from '@spark-view/spark-data'
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
    instanceId: `${PAGE_DESIGN_MODULE_ID}:${pageId}`,
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

    const readScript = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/text-model[page-designer]',
      actionName: 'readScript',
      args: {},
    }, context)
    expect(readScript).toMatchObject({ ok: true, data: { content: 'export default { mounted() {} }' } })

    const payloads = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/payload-catalog[page-designer]',
      actionName: 'queryPayloads',
      args: { category: 'container', limit: 1 },
    }, context)
    expect(resultItemCount(getRecord(payloads))).toBeLessThanOrEqual(1)

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

  it('fails fast when live adapter is missing', async () => {
    const registration = createPageDesignBusinessRegistration({
      getEditToolHost: () => ({
        readScript: () => '',
        readStyle: () => '',
      }),
    })
    const context = hostContext('page-designer')
    await startRegistrationSession(registration, context)

    const bootstrap = await registration.runtime.executeTool('invokeAction', {
      path: '/pageDesign[page-designer]/lifecycle[page-designer]',
      actionName: 'bootstrap',
      args: {},
    }, context)

    expect(bootstrap).toMatchObject({
      ok: false,
      checks: [expect.objectContaining({ code: 'NO_NODE_TREE' })],
    })
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
      instanceId: 'pageDesign:lmspark/homepage',
      runtimeInstanceId: 'pageDesign:lmspark/homepage',
    })).toEqual(nestedContext)
  })
})


