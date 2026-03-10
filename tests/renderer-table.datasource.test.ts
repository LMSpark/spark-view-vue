import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererTable from '../src/components/renderer-containers/RendererTable.vue'
import { SparkData } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import { defineComponent, h, nextTick } from 'vue'

const SparkActionStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h('button', {
      class: 'spark-action-stub',
      'data-type': (props.config as Record<string, unknown>)['type'] as string,
      'data-row-id': String((((props.config as Record<string, unknown>)['props'] as Record<string, unknown> | undefined)?.['row'] as Record<string, unknown> | undefined)?.['id'] ?? ''),
      'data-row-index': String((((props.config as Record<string, unknown>)['props'] as Record<string, unknown> | undefined)?.['rowIndex'] as number | undefined) ?? ''),
      'data-node-id': String((((props.config as Record<string, unknown>)['props'] as Record<string, unknown> | undefined)?.['data'] as Record<string, unknown> | undefined)?.['id'] ?? ''),
      onClick: () => {
        const onMap = (props.config as Record<string, unknown>)['on'] as Record<string, unknown> | undefined
        const click = onMap?.['click']
        if (typeof click === 'function') click('evt')
      },
    }, (props.config as Record<string, unknown>)['type'] as string)
  }
})

const ElTableStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-table-stub' }, slots['default']?.())
  }
})

const ElTableColumnStub = defineComponent({
  props: {
    label: String,
    fixed: [Boolean, String],
  },
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-table-column-stub',
      'data-label': props.label,
      'data-fixed': String(props.fixed ?? ''),
    }, slots['default']?.({ row: { id: 7, name: 'Alice' }, $index: 2 }))
  }
})

const ElTreeStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-tree-stub' }, slots['default']?.({ node: { level: 1 }, data: { id: 'node-1', label: '节点 1' } }))
  }
})

const ElTableColumnDeniedStub = defineComponent({
  props: {
    label: String,
    fixed: [Boolean, String],
  },
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-table-column-stub denied',
      'data-label': props.label,
      'data-fixed': String(props.fixed ?? ''),
    }, slots['default']?.({ row: { id: 8, name: 'Bob', _perm: { allowDelete: false } }, $index: 1 }))
  }
})

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

    // tryAutoLoad only fires when table has API config
    ds.getTable('Nodes')!.setApi({ list: { url: '/api/nodes', method: 'GET' } })

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

  it('should render table toolbar and scoped row actions with position props', async () => {
    const rowActionSpy = vi.fn()

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: { rows: [{ id: 1 }] },
        toolbar: [{ type: 'toolbar-button' }],
        toolbarPosition: 'bottom',
        rowActions: [{ type: 'row-button', on: { click: rowActionSpy } }],
        rowActionsPosition: 'left',
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    expect(wrapper.find('.renderer-table-layout--bottom').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="toolbar-button"]').exists()).toBe(true)

    const rowAction = wrapper.find('.spark-action-stub[data-type="row-button"]')
    expect(rowAction.attributes('data-row-id')).toBe('7')
    expect(rowAction.attributes('data-row-index')).toBe('2')

    await rowAction.trigger('click')
    expect(rowActionSpy).toHaveBeenCalledWith({ id: 7, name: 'Alice' }, 2, 'evt')
  })

  it('should render tree toolbar and scoped node actions with position props', async () => {
    const nodeActionSpy = vi.fn()

    const { default: RendererTree } = await import('../src/components/renderer-containers/RendererTree.vue')
    const wrapper = mount(RendererTree as any, {
      props: {
        data: [{ id: 'node-1', label: '节点 1' }],
        toolbar: [{ type: 'tree-toolbar' }],
        toolbarPosition: 'right',
        nodeActions: [{ type: 'node-button', on: { click: nodeActionSpy } }],
        nodeActionsPosition: 'left',
      },
      global: {
        stubs: {
          'el-tree': ElTreeStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    expect(wrapper.find('.renderer-tree-layout--right').exists()).toBe(true)
    expect(wrapper.find('.custom-tree-node--left').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="tree-toolbar"]').exists()).toBe(true)

    const nodeAction = wrapper.find('.spark-action-stub[data-type="node-button"]')
    expect(nodeAction.attributes('data-node-id')).toBe('node-1')

    await nodeAction.trigger('click')
    expect(nodeActionSpy).toHaveBeenCalledWith({ id: 'node-1', label: '节点 1' }, { level: 1 }, 'evt')
  })

  it('should hide toolbar actions by model permission and row actions by instance permission', async () => {
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: {
          rows: [{ id: 1 }],
          _modelPerm: { allowCreate: false },
        },
        toolbar: [
          { type: 'create-button', props: { permAction: 'create' } },
          { type: 'export-button', props: { permAction: 'export' } },
        ],
        rowActions: [
          { type: 'delete-row', props: { permAction: 'delete' } },
          { type: 'plain-row' },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnDeniedStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    expect(wrapper.find('.spark-action-stub[data-type="create-button"]').exists()).toBe(false)
    expect(wrapper.find('.spark-action-stub[data-type="export-button"]').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="delete-row"]').exists()).toBe(false)
    expect(wrapper.find('.spark-action-stub[data-type="plain-row"]').exists()).toBe(true)
  })

  it('should hide tree toolbar actions by model permission and node actions by instance permission', async () => {
    const { default: RendererTree } = await import('../src/components/renderer-containers/RendererTree.vue')
    const DeniedTreeStub = defineComponent({
      setup(_, { slots }) {
        return () => h('div', { class: 'el-tree-stub denied' }, slots['default']?.({
          node: { level: 1 },
          data: { id: 'node-2', label: '节点 2', _perm: { allowDelete: false } },
        }))
      }
    })

    const wrapper = mount(RendererTree as any, {
      props: {
        dataSource: {
          rows: [{ id: 'node-2', label: '节点 2', _perm: { allowDelete: false } }],
          _modelPerm: { allowImport: false },
        },
        toolbar: [
          { type: 'import-tree', props: { permAction: 'import' } },
          { type: 'export-tree', props: { permAction: 'export' } },
        ],
        nodeActions: [
          { type: 'delete-node', props: { permAction: 'delete' } },
          { type: 'plain-node' },
        ],
      },
      global: {
        stubs: {
          'el-tree': DeniedTreeStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    expect(wrapper.find('.spark-action-stub[data-type="import-tree"]').exists()).toBe(false)
    expect(wrapper.find('.spark-action-stub[data-type="export-tree"]').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="delete-node"]').exists()).toBe(false)
    expect(wrapper.find('.spark-action-stub[data-type="plain-node"]').exists()).toBe(true)
  })
})