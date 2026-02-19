import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererTable from '../packages/spark-renderer/src/components/containers/RendererTable.vue'
import { SparkData } from '../packages/spark-data/src/spark-data'
import { nextTick } from 'vue'

describe('RendererTable - prefer dataSource (DataView as IDataSource)', () => {
  it('should bind only props.dataSource and react to DataView changes', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          rows: [{ id: 1 }, { id: 2 }]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mount(RendererTable as any, {
      props: { dataSource: dv }
    })

    // component's computed tableData should come from dataSource.rows
    const vm = wrapper.vm as any
    expect(vm.tableData).toBeDefined()
    expect(vm.tableData).toEqual(dv.rows)

    // reactive: when DataView.rows changes, component updates
    dv.appendRow({ id: 3 })
    await nextTick()
    expect(vm.tableData).toHaveLength(3)
    expect(vm.tableData[2].id).toBe(3)
  })

  it('should call dataSource.loadFromServer() on mount when rows empty', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS2',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          rows: []
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    // spy on loadFromServer (do not perform real network calls)
    const spy = vi.spyOn(dv, 'loadFromServer').mockResolvedValue({ success: true, data: [] } as any)

    mount(RendererTable as any, { props: { dataSource: dv } })
    // allow lifecycle to run
    await nextTick()

    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('RendererTree should call dataSource.loadFromServer() on mount when rows empty', async () => {
    const { default: RendererTree } = await import('../packages/spark-renderer/src/components/containers/RendererTree.vue')

    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'number' }],
          rows: []
        }
      }
    })

    const dv = ds.getView('Nodes', 'default')!
    // RendererTree calls requestData() → loadFromServer(); spy on requestData directly
    const spy = vi.spyOn(dv, 'requestData').mockResolvedValue(undefined)

    mount(RendererTree as any, {
      props: { dataSource: dv },
      global: {
        // Stub el-tree so the unknown component doesn't crash slot rendering
        stubs: { 'el-tree': { template: '<div><slot :node="{}" :data="{}" /></div>' } }
      }
    })
    await nextTick()

    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })
})