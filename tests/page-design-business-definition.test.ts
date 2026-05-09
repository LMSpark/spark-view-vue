import { describe, expect, it } from 'vitest'

import {
  AiRuntime,
  PageDesignModule,
  type EditToolHost,
} from '../packages/spark-ai/src'
import type { SparkNodeTree } from '../packages/spark-component/src'
import type { DataSetCrudTool } from '../packages/spark-data/src'

function createRuntime() {
  let record = 0
  return new AiRuntime({
    createInstanceId: (_moduleId, _moduleInstanceId) => 'page-design-1',
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

describe('pageDesign module definition', () => {
  it('registers pageDesign as recursive modules and executes through ai runtime', async () => {
    const core = createRuntime()
    const { host, reads } = createHost()
    core.registerModule(new PageDesignModule({ getEditToolHost: () => host }))

    const start = await core.startInstance({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: 'page-designer',
    })

    expect(start.instanceId).toBe('page-design-1')
    expect(start.moduleId).toBe(PageDesignModule.moduleId)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign/lifecycle/bootstrap')).toBe(true)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign/textModel/writeScript')).toBe(true)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign/nodeTree/countNodes')).toBe(true)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign/knowledge/queryPayloads')).toBe(true)
    expect(start.availableFunctions.some((item) => item.action === 'pageDesign/dataset/listTables')).toBe(true)

    const bootstrap = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign/lifecycle/bootstrap',
      args: {},
    })
    expect(bootstrap.result).toMatchObject({ ok: true, data: { phase: 'editing' } })

    const readScript = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign/textModel/readScript',
      args: {},
    })
    expect(readScript.result).toMatchObject({ ok: true, data: { content: 'export default {}' } })

    const writeScript = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign/textModel/writeScript',
      args: { content: 'export default { mounted() {} }' },
    })
    expect(writeScript.result.ok).toBe(true)
    expect(reads().script).toBe('export default { mounted() {} }')

    const countNodes = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign/nodeTree/countNodes',
      args: {},
    })
    expect(countNodes.result).toMatchObject({ ok: true, data: { count: 1 } })

    const payloads = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign/knowledge/queryPayloads',
      args: { keyword: 'table' },
    })
    expect(payloads.result).toMatchObject({ ok: true })

    const listTables = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign/dataset/listTables',
      args: {},
    })
    expect(listTables.result).toMatchObject({ ok: true, data: { tables: [] } })
  })

  it('fails fast when live adapter is missing', async () => {
    const core = createRuntime()
    core.registerModule(new PageDesignModule({
      getEditToolHost: () => ({
        readScript: () => '',
        readStyle: () => '',
      }),
    }))

    const start = await core.startInstance({ moduleId: PageDesignModule.moduleId, moduleInstanceId: 'page-designer' })
    const bootstrap = await core.executeFunctionCall({
      instanceId: start.instanceId,
      action: 'pageDesign/lifecycle/bootstrap',
      args: {},
    })

    expect(bootstrap.result).toMatchObject({
      ok: false,
      code: 'NO_NODE_TREE',
    })
  })
})
