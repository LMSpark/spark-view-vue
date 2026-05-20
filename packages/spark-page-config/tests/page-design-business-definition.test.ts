import { describe, expect, it } from 'vitest'

import {
  PageDesignModule,
} from '@spark-view/spark-page-config/assistant/registrations'
import {
  PageDesignService,
  type PageDesignEditHost,
} from '@spark-view/spark-page-config/page/workspace'
import { SparkNodeTree } from '@spark-view/spark-page-config/page/model'
import { DataSetCrudTool } from '@spark-view/spark-data'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resultItemCount(value: unknown): number {
  if (!isRecord(value) || !isRecord(value['data'])) return 0
  const items = value['data']['items']
  return Array.isArray(items) ? items.length : 0
}

function resultStepCount(value: unknown): number {
  if (!isRecord(value) || !isRecord(value['data'])) return 0
  const steps = value['data']['steps']
  return Array.isArray(steps) ? steps.length : 0
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

describe('pageDesign module definition', () => {
  it('lets the page-design service be manually orchestrated without an AI session', () => {
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

    const counted = service.useNodeTreeMethod(context, {}, {
      serviceLabel: 'countNodes',
      methodName: 'countNodes',
      mutates: false,
    })
    expect(counted).toMatchObject({ ok: true, data: 1 })
    expect(service.getState(context).phase).toBe('editing')
  })

  it('registers pageDesign through recursive modules and executes through the registering module', async () => {
    const { host, reads } = createHost()
    const pageDesign = new PageDesignModule({ getEditToolHost: () => host })

    const projection = await pageDesign.startSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
    })

    expect(projection.scope.instanceId).toBe('page-design-1')
    expect(projection.scope.moduleId).toBe(PageDesignModule.moduleId)
    expect(projection.availableFunctions.some((item) => item.action === 'page-designer@lifecycle@bootstrap')).toBe(true)
    expect(projection.availableFunctions.some((item) => item.action === 'page-designer@lifecycle@describeDesignFlow')).toBe(true)
    expect(projection.availableFunctions.some((item) => item.action === 'page-designer@textModel@writeScript')).toBe(true)
    expect(projection.availableFunctions.some((item) => item.action === 'page-designer@nodeTree@countNodes')).toBe(true)
    expect(projection.availableFunctions.some((item) => item.action === 'page-designer@knowledge@queryPayloads')).toBe(true)
    expect(projection.availableFunctions.some((item) => item.action === 'page-designer@dataset@listTables')).toBe(true)
    expect(projection.availableFunctions.some((item) => item.action === 'page-designer@dataset@export')).toBe(true)
    expect(projection.availableFunctions.some((item) => item.action === 'page-designer@dataset@listAggregates')).toBe(true)
    expect(projection.availableFunctions.every((item) => !('functionId' in item))).toBe(true)

    expect('getRegistrationData' in pageDesign).toBe(false)
    expect('getRegistrationStoreSnapshot' in pageDesign).toBe(false)
    expect(pageDesign.description).toBe('单页面四文件编辑模块：rule.json、pagedata.json、script.js、style.css。')
    expect(pageDesign.prompt).toBe('你正在处理页面设计业务，支持 lifecycle、textModel、nodeTree、dataset、knowledge 五大子模块。')
    expect(pageDesign.getFunctions()).toEqual([])
    expect(pageDesign.modules.map((module) => module.moduleId)).toEqual([
      'lifecycle',
      'textModel',
      'knowledge',
      'nodeTree',
      'dataset',
    ])
    expect(pageDesign.modules
      .find((module) => module.moduleId === 'lifecycle')
      ?.getFunctions().some((definition) => definition.functionId === 'bootstrap')).toBe(true)

    pageDesign.appendMessage({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      role: 'user',
      content: 'Update current page files.',
    })

    const bootstrap = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      action: 'page-designer@lifecycle@bootstrap',
      args: {},
      projection,
    })
    expect(bootstrap).toMatchObject({ ok: true, data: { phase: 'editing' } })

    const designFlow = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      action: 'page-designer@lifecycle@describeDesignFlow',
      args: { phase: '入口', afterStep: 10 },
      projection,
    })
    expect(designFlow).toMatchObject({ ok: true, data: { nextStep: { step: 11, phase: '盘点' } } })
    expect(resultStepCount(designFlow)).toBe(10)

    const readScript = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      action: 'page-designer@textModel@readScript',
      args: {},
      projection,
    })
    expect(readScript).toMatchObject({ ok: true, data: { content: 'export default {}' } })

    const writeScript = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      action: 'page-designer@textModel@writeScript',
      args: { content: 'export default { mounted() {} }' },
      projection,
    })
    expect(writeScript.ok).toBe(true)
    expect(reads().script).toBe('export default { mounted() {} }')

    const countNodes = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      action: 'page-designer@nodeTree@countNodes',
      args: {},
      projection,
    })
    expect(countNodes).toMatchObject({ ok: true, data: 1 })

    const payloads = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      action: 'page-designer@knowledge@queryPayloads',
      args: { category: 'container', limit: 1 },
      projection,
    })
    expect(payloads).toMatchObject({ ok: true })
    expect(resultItemCount(payloads)).toBeLessThanOrEqual(1)

    const listTables = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      action: 'page-designer@dataset@listTables',
      args: {},
      projection,
    })
    expect(listTables).toMatchObject({ ok: true, data: [] })

    const history = pageDesign.getSessionHistory({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
    })
    expect(history.map((entry) => entry.kind)).toEqual([
      'message',
      'functionCall',
      'functionCall',
      'functionCall',
      'functionCall',
      'functionCall',
      'functionCall',
      'functionCall',
    ])
    expect(history.at(-1)).toMatchObject({
      kind: 'functionCall',
      action: 'page-designer@dataset@listTables',
      status: 'completed',
    })
  })

  it('fails fast when live adapter is missing', async () => {
    const pageDesign = new PageDesignModule({
      getEditToolHost: () => ({
        readScript: () => '',
        readStyle: () => '',
      }),
    })

    const projection = await pageDesign.startSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
    })
    const bootstrap = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
      instanceId: 'page-design-1',
      action: 'page-designer@lifecycle@bootstrap',
      args: {},
      projection,
    })

    expect(bootstrap).toMatchObject({
      ok: false,
      code: 'NO_NODE_TREE',
    })
  })

  it('isolates parallel page-design instances by root page entity id', async () => {
    const pageA = createHost({ script: 'export default { page: "A" }' })
    const pageB = createHost({ script: 'export default { page: "B" }' })
    const pageDesign = new PageDesignModule({
      getEditToolHost: (context) => context.moduleInstanceId === 'page-a' ? pageA.host : pageB.host,
    })

    const projectionA = await pageDesign.startSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-a',
      instanceId: 'session-a',
    })
    const projectionB = await pageDesign.startSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-b',
      instanceId: 'session-b',
    })

    await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-a',
      instanceId: 'session-a',
      action: 'page-a@lifecycle@bootstrap',
      args: {},
      projection: projectionA,
    })
    await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-b',
      instanceId: 'session-b',
      action: 'page-b@lifecycle@bootstrap',
      args: {},
      projection: projectionB,
    })
    await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-a',
      instanceId: 'session-a',
      action: 'page-a@textModel@writeScript',
      args: { content: 'export default { page: "A", changed: true }' },
      projection: projectionA,
    })

    expect(pageA.reads().script).toBe('export default { page: "A", changed: true }')
    expect(pageB.reads().script).toBe('export default { page: "B" }')
    expect(pageDesign.getSessionHistory({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-a',
      instanceId: 'session-a',
    })).toHaveLength(2)
    expect(pageDesign.getSessionHistory({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-b',
      instanceId: 'session-b',
    })).toHaveLength(1)

    pageDesign.stopSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-a',
      instanceId: 'session-a',
    })
    const restartedA = await pageDesign.startSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-a',
      instanceId: 'session-a-2',
    })
    const progressA = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-a',
      instanceId: 'session-a-2',
      action: 'page-a@lifecycle@describeProgress',
      args: {},
      projection: restartedA,
    })

    expect(progressA).toMatchObject({ ok: true, data: { phase: 'editing' } })
  })

  it('supports page entity ids that contain route separators in LLM action paths', async () => {
    const pageHost = createHost({ script: 'export default { route: "nested" }' })
    const pageDesign = new PageDesignModule({
      getEditToolHost: () => pageHost.host,
    })
    const projection = await pageDesign.startSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'lmspark/homepage',
      instanceId: 'nested-page-session',
    })

    expect(projection.availableFunctions.some((item) => item.action === 'lmspark%2Fhomepage@lifecycle@bootstrap')).toBe(true)

    const bootstrap = await pageDesign.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'lmspark/homepage',
      instanceId: 'nested-page-session',
      action: 'lmspark%2Fhomepage@lifecycle@bootstrap',
      args: {},
      projection,
    })

    expect(bootstrap).toMatchObject({ ok: true, data: { phase: 'editing' } })
    expect(pageDesign.getSessionHistory({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'lmspark/homepage',
      instanceId: 'nested-page-session',
    })).toHaveLength(1)
  })
})
