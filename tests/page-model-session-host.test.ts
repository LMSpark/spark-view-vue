import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { clearDomains, clearRegistry } from '../packages/spark-ai/src/stills'
import { SparkNodeTree } from '../packages/spark-component/src/index'
import { DataSetCrudTool } from '../packages/spark-data/src/index'
import { usePageModelSessionHost } from '../src/views/app/dev-system/composables/usePageModelSessionHost'

describe('usePageModelSessionHost', () => {
  beforeEach(() => {
    clearDomains()
    clearRegistry()
  })

  it('keeps the same session while the session key is unchanged even if page-model content changes', () => {
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
        writeScript(content) {
          script = content
        },
        readStyle: () => style,
        writeStyle(content) {
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
    expect(second.session).toBe(first.session)
    expect(second.bootstrapped).toBe(false)

    pageId.value = 'orders-page-v2'

    expect(host.hasSessionMismatch()).toBe(true)

    const third = host.ensureSession()
    expect(third.session).not.toBe(first.session)
    expect(third.bootstrapped).toBe(true)
  })
})