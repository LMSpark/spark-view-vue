import { describe, expect, it } from 'vitest'
import { DataSetCrudTool } from '@spark-view/spark-data'
import {
  PageDesignService,
  SparkNodeTree,
  type PageDesignEditHost,
} from '@spark-view/spark-page-config'

describe('PageDesignService edit notifications', () => {
  it('notifies host only when mutating calls actually change the undo model', () => {
    const tree = SparkNodeTree.fromRuleJson([
      { type: 'r-text', id: 'txt', props: { text: 'hello' } },
    ])
    tree.clearHistory()

    const dataSetTool = DataSetCrudTool.fromJson({
      dataSetName: 'DemoDS',
      tables: {
        StatusOptions: {
          tableName: 'StatusOptions',
          columns: [{ name: 'id', type: 'number', isPrimaryKey: true }],
          views: { default: { rows: [] } },
          resourceType: 'static-data',
        },
      },
    })
    dataSetTool.clearHistory()

    let nodeTreeChanged = 0
    let dataSetChanged = 0
    const host: PageDesignEditHost = {
      getNodeTree: () => tree,
      onNodeTreeChanged: () => { nodeTreeChanged += 1 },
      getDataSetTool: () => dataSetTool,
      onDataSetChanged: () => { dataSetChanged += 1 },
      readScript: () => '',
      writeScript: () => undefined,
      readStyle: () => '',
      writeStyle: () => undefined,
    }
    const service = new PageDesignService({ getEditHost: () => host })
    const context = { requestId: 'req-1', pageId: 'page-1' }

    expect(service.bootstrap(context).ok).toBe(true)
    service.useNodeTreeMethod(
      context,
      { componentId: 'txt', props: { text: 'hello' }, merge: true },
      { serviceLabel: 'setProps', methodName: 'setProps', mutates: true },
    )
    service.useDatasetMethod(
      context,
      { tableName: 'StatusOptions', resourceType: 'static-data' },
      { serviceLabel: 'updateTable', methodName: 'updateTable', mutates: true },
    )

    expect(nodeTreeChanged).toBe(0)
    expect(dataSetChanged).toBe(0)
    expect(tree.canUndo).toBe(false)

    service.useNodeTreeMethod(
      context,
      { componentId: 'txt', props: { text: 'updated' }, merge: true },
      { serviceLabel: 'setProps', methodName: 'setProps', mutates: true },
    )
    service.useDatasetMethod(
      context,
      { tableName: 'StatusOptions', resourceType: 'logical-view' },
      { serviceLabel: 'updateTable', methodName: 'updateTable', mutates: true },
    )

    expect(nodeTreeChanged).toBe(1)
    expect(dataSetChanged).toBe(1)
    expect(tree.canUndo).toBe(true)
    expect(dataSetTool.getTable('StatusOptions')?.resourceType).toBe('logical-view')
  })
})
