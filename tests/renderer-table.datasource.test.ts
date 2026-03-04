import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererTable from '../src/components/renderer-containers/RendererTable.vue'
import { SparkData } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import { nextTick } from 'vue'

describe('RendererTable - DataView as single data intermediary', () => {
  it('should bind dataView prop and react to DataView changes', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' as const }],
          rows: [{ id: 1 }, { id: 2 }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mount(RendererTable as any, {
      props: { dataView: dv }
    })

    // component's computed tableData should come from DataView.rows
    const vm = wrapper.vm as any
    expect(vm.tableData).toBeDefined()
    expect(vm.tableData).toEqual(dv.rows)

    // reactive: when DataView.rows changes, component updates
    dv.appendRow({ id: 3 })
    await nextTick()
    expect(vm.tableData).toHaveLength(3)
    expect(vm.tableData[2].id).toBe(3)
  })

  it('should call requestData() on mount when table has API and rows empty', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS2',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' as const }],
          rows: [] as IDataRow[]
        }
      }
    })

    // tryAutoLoad only fires when table has API config
    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })

    const dv = ds.getView('Users', 'default')!
    // spy on requestData (tryAutoLoad calls this)
    const spy = vi.spyOn(dv, 'requestData').mockResolvedValue(undefined)

    mount(RendererTable as any, { props: { dataView: dv } })
    // allow lifecycle to run
    await nextTick()

    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('should NOT call requestData() for inline data tables (no API)', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS2b',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' as const }],
          rows: [{ id: 1 }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const spy = vi.spyOn(dv, 'requestData').mockResolvedValue(undefined)

    mount(RendererTable as any, { props: { dataView: dv } })
    await nextTick()

    // 内联数据表无 API，tryAutoLoad 应跳过
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })

  it('RendererTree should call dataSource.loadFromServer() on mount when rows empty', async () => {
    const { default: RendererTree } = await import('../src/components/renderer-containers/RendererTree.vue')

    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'number' as const }],
          rows: [] as IDataRow[]
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