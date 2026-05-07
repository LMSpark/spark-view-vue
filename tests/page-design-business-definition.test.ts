import { describe, expect, it } from 'vitest'

import {
  PAGE_DESIGN_BUSINESS,
  createAiCore,
  createPageDesignBusinessRegistration,
  type EditToolHost,
} from '../packages/spark-ai/src'
import type { SparkNodeTree } from '../packages/spark-component/src'
import type { DataSetCrudTool } from '../packages/spark-data/src'

function createCore() {
  let record = 0
  return createAiCore({
    createInstanceId: () => 'page-design-1',
    createRecordId: (kind) => `${kind}-${++record}`,
    now: () => 1778040000000 + record,
  })
}

function createHost(): { host: EditToolHost; reads: () => { script: string; style: string; nodeChanged: number; dataChanged: number } } {
  let script = 'export default {}'
  let style = '.page { color: red; }'
  let nodeChanged = 0
  let dataChanged = 0
  const nodeTree = {
    toJSON: () => ({ type: 'page', props: {}, children: [] }),
    countNodes: () => ({ count: 1 }),
  }
  const dataSetTool = {
    toJson: () => ({ tables: [] }),
    listTables: () => ({ tables: [] }),
  }
  return {
    host: {
      getNodeTree: () => nodeTree as unknown as SparkNodeTree,
      onNodeTreeChanged: () => { nodeChanged += 1 },
      getDataSetTool: () => dataSetTool as unknown as DataSetCrudTool,
      onDataSetChanged: () => { dataChanged += 1 },
      readScript: () => script,
      writeScript: (content) => { script = content },
      readStyle: () => style,
      writeStyle: (content) => { style = content },
    },
    reads: () => ({ script, style, nodeChanged, dataChanged }),
  }
}

describe('pageDesign business definition', () => {
  it('registers pageDesign as business modules and executes through ai core', async () => {
    const core = createCore()
    const { host, reads } = createHost()
    core.registerBusiness(createPageDesignBusinessRegistration({ getEditToolHost: () => host }))

    const start = await core.startSession({ businessId: PAGE_DESIGN_BUSINESS })

    expect(start.instanceId).toBe('page-design-1')
    expect(start.businessId).toBe(PAGE_DESIGN_BUSINESS)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign@lifecycle@bootstrap')).toBe(true)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign@textModel@writeScript')).toBe(true)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign@nodeTree@countNodes')).toBe(true)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign@dataset@listTables')).toBe(true)

    const bootstrap = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign@lifecycle@bootstrap',
      args: {},
    })
    expect(bootstrap.result).toMatchObject({ ok: true, data: { phase: 'editing' } })

    const readScript = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign@textModel@readScript',
      args: {},
    })
    expect(readScript.result).toMatchObject({ ok: true, data: { content: 'export default {}' } })

    const writeScript = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign@textModel@writeScript',
      args: { content: 'export default { mounted() {} }' },
    })
    expect(writeScript.result.ok).toBe(true)
    expect(reads().script).toBe('export default { mounted() {} }')

    const countNodes = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign@nodeTree@countNodes',
      args: {},
    })
    expect(countNodes.result).toMatchObject({ ok: true, data: { count: 1 } })

    const listTables = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign@dataset@listTables',
      args: {},
    })
    expect(listTables.result).toMatchObject({ ok: true, data: { tables: [] } })
  })

  it('fails fast when live adapter is missing', async () => {
    const core = createCore()
    core.registerBusiness(createPageDesignBusinessRegistration({
      getEditToolHost: () => ({
        readScript: () => '',
        readStyle: () => '',
      }),
    }))

    const start = await core.startSession({ businessId: PAGE_DESIGN_BUSINESS })
    const bootstrap = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign@lifecycle@bootstrap',
      args: {},
    })

    expect(bootstrap.result).toMatchObject({
      ok: false,
      code: 'NO_NODE_TREE',
    })
  })
})

