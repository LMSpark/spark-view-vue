import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { clearFunctionRegistry, clearKnowledgeRegistry } from '@spark-view/spark-ai'
import { SparkNodeTree } from '../packages/spark-component/src/index'
import { DataSetCrudTool } from '../packages/spark-data/src/index'
import { usePageModelSessionHost } from '../src/views/app/dev-system/page-model-session'

describe('usePageModelSessionHost', () => {
  beforeEach(() => {
    clearFunctionRegistry()
    clearKnowledgeRegistry()
  })

  it('keeps the same context while the session key is unchanged even if page-model content changes', () => {
    const pageId = ref('orders-page')
    const liveTree = new SparkNodeTree({ root: { type: 'page', children: [] } })
    const liveDataSet = DataSetCrudTool.fromJson({ dataSetName: 'OrdersDS', tables: {} })
    let script = 'export default {}\n'
    let style = '.page {}\n'

    const host = usePageModelSessionHost({
      getSessionKey: () => pageId.value,
      getEditToolHost: () => ({
        getNodeTree: () => liveTree,
        getDataSetTool: () => liveDataSet,
        readScript: () => script,
        writeScript(content: string) {
          script = content
        },
        readStyle: () => style,
        writeStyle(content: string) {
          style = content
        },
      }),
    })

    const first = host.ensureSession()
    expect(first.bootstrapped).toBe(true)
    expect(host.hasSessionMismatch()).toBe(false)

    script = 'export default { changed: true }\n'
    liveDataSet.createTable({ tableName: 'Users', columns: [{ name: 'id', type: 'number', isPrimaryKey: true }] })

    expect(host.hasSessionMismatch()).toBe(false)

    const second = host.ensureSession()
    expect(second.context).toBe(first.context)
    expect(second.bootstrapped).toBe(false)

    pageId.value = 'orders-page-v2'

    expect(host.hasSessionMismatch()).toBe(true)

    const third = host.ensureSession()
    expect(third.context).not.toBe(first.context)
    expect(third.bootstrapped).toBe(true)
  })
})