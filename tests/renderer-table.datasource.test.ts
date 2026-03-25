import { describe, it, expect } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { RendererTable } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import { defineComponent, h, nextTick } from 'vue'
import { bindDataToRules } from '../packages/spark-component/src/renderer/binding/bindRules'

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

const ElButtonStub = defineComponent({
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
    type: String,
    size: String,
    plain: Boolean,
    text: Boolean,
    link: Boolean,
  },
  emits: ['click'],
  setup(props, { slots, emit }) {
    return () => h('button', {
      class: 'el-button-stub',
      'data-type': props.type ?? '',
      'data-size': props.size ?? '',
      'data-plain': String(Boolean(props.plain)),
      'data-text': String(Boolean(props.text)),
      'data-link': String(Boolean(props.link)),
      disabled: props.disabled,
      onClick: (event: Event) => emit('click', event),
    }, slots['default']?.())
  },
})

function createTableFieldStub(fallbackLabel: string) {
  return defineComponent({
    props: {
      config: {
        type: Object,
        required: true,
      },
      label: String,
    },
    setup(props) {
      return () => h(ElTableColumnStub, {
        label: props.label
          ?? String((((props.config as Record<string, unknown>)['props'] as Record<string, unknown> | undefined)?.['label'])
            ?? ((props.config as Record<string, unknown>)['field'] as string | undefined)
            ?? fallbackLabel),
      })
    },
  })
}

const TableTextFieldStub = createTableFieldStub('r-text')
const TableNumberFieldStub = createTableFieldStub('r-number')
const TableDateFieldStub = createTableFieldStub('r-date')

const SparkColumnRendererStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const config = props.config as Record<string, unknown>
      const type = String(config['type'] ?? '')
      const componentMap: Record<string, unknown> = {
        'r-text': TableTextFieldStub,
        'r-number': TableNumberFieldStub,
        'r-date': TableDateFieldStub,
      }
      const component = componentMap[type]
      if (component) {
        return h(component as never, {
          config,
          ...((config['props'] as Record<string, unknown> | undefined) ?? {}),
        })
      }
      // 非列组件回退为 action stub（toolbar / row-actions 等）
      const onMap = config['on'] as Record<string, unknown> | undefined
      const click = onMap?.['click']
      return h('button', {
        class: 'spark-action-stub',
        'data-type': type,
        'data-row-id': String((((config['props'] as Record<string, unknown> | undefined)?.['row'] as Record<string, unknown> | undefined)?.['id'] ?? '')),
        'data-row-index': String((((config['props'] as Record<string, unknown> | undefined)?.['rowIndex'] as number | undefined) ?? '')),
        'data-node-id': String((((config['props'] as Record<string, unknown> | undefined)?.['data'] as Record<string, unknown> | undefined)?.['id'] ?? '')),
        onClick: () => { if (typeof click === 'function') click('evt') },
      }, type)
    }
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

const RendererFieldScopeStub = defineComponent({
  props: {
    model: {
      type: Object,
      required: true,
    },
    configs: {
      type: Array,
      required: true,
    },
    autoFitMinWidth: {
      type: String,
      default: '',
    },
    defaultColSpan: {
      type: Number,
      default: 24,
    },
  },
  setup(props) {
    return () => h('div', {
      class: 'renderer-field-scope-stub',
      'data-auto-fit-min-width': props.autoFitMinWidth,
      'data-default-col-span': String(props.defaultColSpan),
    },
      ((props.configs as unknown[]) as Array<Record<string, unknown>>).map((config) => {
        const configProps = config['props'] as Record<string, unknown> | undefined
        const fieldName = String(configProps?.['field'] ?? '')
        const model = props.model as Record<string, unknown>
        return h('input', {
          key: fieldName,
          class: 'renderer-filter-input',
          'data-name': fieldName,
          'data-type': String(config['type'] ?? ''),
          value: String(model[fieldName] ?? ''),
          onInput: (event: Event) => {
            const target = event.target as HTMLInputElement
            model[fieldName] = target.value
          },
        })
      })
    )
  }
})

describe('RendererTable - DataView as single data intermediary', () => {
  it('should fail fast when migrated containers still use legacy root toolbar config', () => {
    expect(() => bindDataToRules({
      rules: [
        {
          type: 'r-table',
          dataKey: 'Users@rows',
          toolbar: {
            items: [
              { type: 'builtin-action', props: { builtinAction: 'refresh' } },
            ],
            position: 'top',
          },
        },
      ] as never[],
      pageFunctions: {},
      dataSet: null,
    })).toThrow(/已废除根级 toolbar 配置/)
  })

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

  it('RendererTree should call requestData() on mount when rows empty', async () => {
    const { RendererTree } = await import('@spark-view/spark-component')

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
      props: { dataView: dv },
      global: {
        // Stub el-tree so the unknown component doesn't crash slot rendering
        stubs: { 'el-tree': { template: '<div><slot :node="{}" :data="{}" /></div>' } }
      }
    })
    await nextTick()

    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('should render table toolbar from docked children and scoped row actions', async () => {
    const rowActionSpy = vi.fn()

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: { rows: [{ id: 1 }] },
        docks: { toolbar: { position: 'bottom' } },
        rowActions: [{ type: 'row-button', on: { click: rowActionSpy } }],
        rowActionsPosition: 'left',
        children: [{ type: 'toolbar-button', dock: 'toolbar' }],
      },
      global: {
        components: {
          'r-text': TableTextFieldStub,
          'r-number': TableNumberFieldStub,
          'r-date': TableDateFieldStub,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
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

  it('should execute builtin toolbar actions without script handlers', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Toolbar',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }] as IDataRow[]
        }
      }
    })

    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })
    const dv = ds.getView('Users', 'default')!
    const refreshSpy = vi.spyOn(dv, 'refresh').mockResolvedValue(undefined)

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        children: [
          {
            type: 'builtin-action',
            dock: 'toolbar',
            props: {
              builtinAction: 'append-row',
              label: '新增',
              appendPayload: { id: 2, name: 'Bob' },
              successMessage: '',
            },
          },
          {
            type: 'builtin-action',
            dock: 'toolbar',
            props: {
              builtinAction: 'refresh',
              label: '刷新',
              successMessage: '',
            },
          },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    const buttons = wrapper.findAll('.el-button-stub')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.text()).toBe('新增')
    expect(buttons[1]?.text()).toBe('刷新')

    await buttons[0]!.trigger('click')
    await flushPromises()
    expect(dv.rows).toHaveLength(2)
    expect(dv.rows[1]?.['name']).toBe('Bob')

    await buttons[1]!.trigger('click')
    await flushPromises()
    expect(refreshSpy).toHaveBeenCalled()

    refreshSpy.mockRestore()
  })

  it('should skip builtin refresh for inline tables without API', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Refresh-Inline',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const refreshSpy = vi.spyOn(dv, 'refresh').mockResolvedValue(undefined)

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        children: [
          {
            type: 'builtin-action',
            dock: 'toolbar',
            props: {
              builtinAction: 'refresh',
              label: '刷新',
              silent: true,
            },
          },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(refreshSpy).not.toHaveBeenCalled()

    refreshSpy.mockRestore()
  })

  it('should treat empty successMessage as silent (no PAGE_SERVICE warn fallback)', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Silent',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        children: [
          {
            type: 'builtin-action',
            dock: 'toolbar',
            props: {
              builtinAction: 'append-row',
              label: '新增',
              appendPayload: { id: 2, name: 'Bob' },
              successMessage: '',
            },
          },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(dv.rows).toHaveLength(2)
    const warnMessages = warnSpy.mock.calls
      .flatMap(call => call.map(item => String(item)))
      .join(' ')
    expect(warnMessages.includes('PAGE_SERVICE 不可用')).toBe(false)

    warnSpy.mockRestore()
  })

  it('should execute builtin row delete action directly on data view rows', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Row',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 7, name: 'Alice' }, { id: 8, name: 'Bob' }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        rowActions: [
          {
            type: 'builtin-action',
            props: {
              builtinAction: 'delete-row',
              label: '删除',
              successMessage: '',
              confirmMessage: '',
            },
          },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    const rowDeleteBtn = wrapper.find('.el-button-stub')
    expect(rowDeleteBtn.exists()).toBe(true)

    await rowDeleteBtn.trigger('click')
    await flushPromises()

    expect(dv.rows).toHaveLength(1)
    expect(dv.rows[0]?.['id']).toBe(8)
  })

  it('should execute builtin delete-selected action by selectedRows', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Delete-Selected',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Carol' }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    dv.selection.setSelectedRows([dv.rows[0]!, dv.rows[2]!])

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        children: [
          {
            type: 'builtin-action',
            dock: 'toolbar',
            props: {
              builtinAction: 'delete-selected',
              label: '删除勾选',
              successMessage: '',
              confirmMessage: '',
            },
          },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(dv.rows).toHaveLength(1)
    expect(dv.rows[0]?.['id']).toBe(2)
  })

  it('should suppress notification fallback when silent is true', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Silent-Flag',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        children: [
          {
            type: 'builtin-action',
            dock: 'toolbar',
            props: {
              builtinAction: 'append-row',
              label: '新增静默',
              appendPayload: { id: 2, name: 'Bob' },
              silent: true,
            },
          },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(dv.rows).toHaveLength(2)
    const warnMessages = warnSpy.mock.calls
      .flatMap(call => call.map(item => String(item)))
      .join(' ')
    expect(warnMessages.includes('PAGE_SERVICE 不可用')).toBe(false)

    warnSpy.mockRestore()
  })

  it('should catch builtin refresh errors and report configured error message', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Refresh-Error',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }] as IDataRow[]
        }
      }
    })

    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })
    const dv = ds.getView('Users', 'default')!
    const refreshSpy = vi.spyOn(dv, 'refresh').mockRejectedValue(new Error('network down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        children: [
          {
            type: 'builtin-action',
            dock: 'toolbar',
            props: {
              builtinAction: 'refresh',
              label: '刷新',
              errorMessage: '刷新失败',
            },
          },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(refreshSpy).toHaveBeenCalled()
    const warnMessages = warnSpy.mock.calls
      .flatMap(call => call.map(item => String(item)))
      .join(' ')
    expect(warnMessages.includes('刷新失败: network down')).toBe(true)

    refreshSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('should show failureMessage when delete-selected removes zero rows', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Delete-Selected-Failure',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          rows: [{ id: 1, name: 'Alice' }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    dv.selection.setSelectedRows([dv.rows[0]!])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        children: [
          {
            type: 'builtin-action',
            dock: 'toolbar',
            props: {
              builtinAction: 'delete-selected',
              label: '删除勾选',
              idField: 'uid',
              confirmMessage: '',
              failureMessage: '没有可删除记录',
            },
          },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(dv.rows).toHaveLength(1)
    const warnMessages = warnSpy.mock.calls
      .flatMap(call => call.map(item => String(item)))
      .join(' ')
    expect(warnMessages.includes('没有可删除记录')).toBe(true)

    warnSpy.mockRestore()
  })

  it('should render tree toolbar from docked children and scoped node actions', async () => {
    const nodeActionSpy = vi.fn()

    const { RendererTree } = await import('@spark-view/spark-component')
    const wrapper = mount(RendererTree as any, {
      props: {
        data: [{ id: 'node-1', label: '节点 1' }],
        docks: { toolbar: { position: 'right' } },
        children: [
          { type: 'tree-toolbar', dock: 'toolbar' },
          { type: 'node-button', on: { click: nodeActionSpy } },
        ],
      },
      global: {
        stubs: {
          'el-tree': ElTreeStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    expect(wrapper.find('.renderer-tree-layout--right').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="tree-toolbar"]').exists()).toBe(true)

    const nodeAction = wrapper.find('.spark-action-stub[data-type="node-button"]')
    expect(nodeAction.exists()).toBe(true)

    await nodeAction.trigger('click')
    expect(nodeActionSpy).toHaveBeenCalled()
  })

  it('should allow row-action slots and render docked toolbar children', () => {
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: { rows: [{ id: 1 }] },
        rowActionsPosition: 'right',
        children: [{ type: 'biz-toolbar', dock: 'toolbar' }],
      },
      slots: {
        'row-actions': ({ row, rowIndex }: Record<string, unknown>) => h('button', {
          class: 'biz-row-action',
          'data-row-id': String((row as Record<string, unknown>)['id'] ?? ''),
          'data-row-index': String(rowIndex ?? ''),
        }, 'biz-row-action'),
      },
      global: {
        components: {
          'r-text': TableTextFieldStub,
          'r-number': TableNumberFieldStub,
          'r-date': TableDateFieldStub,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        }
      }
    })

    expect(wrapper.find('.spark-action-stub[data-type="biz-toolbar"]').exists()).toBe(true)
    expect(wrapper.find('.biz-row-action').attributes('data-row-id')).toBe('7')
    expect(wrapper.find('.biz-row-action').attributes('data-row-index')).toBe('2')
  })

  it('should ignore legacy toolbar props once docked toolbar mode is enabled', () => {
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: { rows: [{ id: 1 }] },
        toolbar: [{ type: 'legacy-toolbar-button' }],
        toolbarPosition: 'bottom',
        children: [{ type: 'toolbar-button', dock: 'toolbar' }],
      },
      global: {
        components: {
          'r-text': TableTextFieldStub,
          'r-number': TableNumberFieldStub,
          'r-date': TableDateFieldStub,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        }
      }
    })

    expect(wrapper.find('.spark-action-stub[data-type="toolbar-button"]').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="legacy-toolbar-button"]').exists()).toBe(false)
    expect(wrapper.find('.renderer-table-layout--bottom').exists()).toBe(false)
  })

  it('should render primitive field configs as direct table columns', () => {
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: {
          rows: [{ id: 1, name: 'Alice', score: 95, joinedAt: '2026-03-10' }],
        },
        children: [
          { type: 'r-text', props: { field: 'name', label: '姓名' } },
          { type: 'r-number', props: { field: 'score', label: '分数' } },
          { type: 'r-date', props: { field: 'joinedAt', label: '入职日期' } },
        ],
      },
      global: {
        components: {
          'r-text': TableTextFieldStub,
          'r-number': TableNumberFieldStub,
          'r-date': TableDateFieldStub,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        }
      }
    })

    const columns = wrapper.findAll('.el-table-column-stub')
    const labels = columns.map(column => column.attributes('data-label'))
    expect(labels).toContain('姓名')
    expect(labels).toContain('分数')
    expect(labels).toContain('入职日期')
  })

  it('should render table columns from config.children', () => {
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: {
          rows: [{ id: 1, name: 'Alice', score: 95 }],
        },
        children: [
          { type: 'r-text', props: { field: 'name', label: '姓名' } },
          { type: 'r-number', props: { field: 'score', label: '分数' } },
        ],
      },
      global: {
        components: {
          'r-text': TableTextFieldStub,
          'r-number': TableNumberFieldStub,
          'r-date': TableDateFieldStub,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        }
      }
    })

    const columns = wrapper.findAll('.el-table-column-stub')
    const labels = columns.map(column => column.attributes('data-label'))
    expect(labels).toContain('姓名')
    expect(labels).toContain('分数')
  })

  it('should render docked tree toolbar children and content template', async () => {
    const { RendererTree } = await import('@spark-view/spark-component')
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Tree-Slots',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          rows: [{ id: 'node-1', label: '节点 1' }] as IDataRow[]
        }
      }
    })
    const dv = ds.getView('Nodes', 'default')!
    const wrapper = mount(RendererTree as any, {
      props: {
        dataView: dv,
        children: [{ type: 'biz-tree-toolbar', dock: 'toolbar' }],
      },
      slots: {
        default: ({ data }: Record<string, unknown>) => h('span', {
          class: 'biz-node-template',
          'data-node-label': String((data as Record<string, unknown>)['label'] ?? ''),
        }, 'biz-node-template'),
      },
      global: {
        stubs: {
          'el-tree': ElTreeStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    expect(wrapper.find('.spark-action-stub[data-type="biz-tree-toolbar"]').exists()).toBe(true)
    expect(wrapper.find('.biz-node-template').attributes('data-node-label')).toBe('节点 1')
  })

  it('should hide toolbar actions by model permission and row actions by instance permission', async () => {
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: {
          rows: [{ id: 1 }],
          _modelPerm: { allowCreate: false },
        },
        children: [
          { type: 'create-button', dock: 'toolbar', props: { permAction: 'create' } },
          { type: 'export-button', dock: 'toolbar', props: { permAction: 'export' } },
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

  it('should hide tree toolbar actions by model permission and node children by instance permission', async () => {
    const { RendererTree } = await import('@spark-view/spark-component')
    const DeniedTreeStub = defineComponent({
      setup(_, { slots }) {
        return () => h('div', { class: 'el-tree-stub denied' }, slots['default']?.({
          node: { level: 1 },
          data: { id: 'node-2', label: '节点 2', _perm: { allowDelete: false } },
        }))
      }
    })

    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Tree-Perm',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          rows: [{ id: 'node-2', label: '节点 2', _perm: { allowDelete: false } }] as IDataRow[]
        }
      }
    })
    const dv = ds.getView('Nodes', 'default')!
    // Inject _modelPerm on the DataView
    ;(dv as any)._modelPerm = { allowImport: false }

    const wrapper = mount(RendererTree as any, {
      props: {
        dataView: dv,
        children: [
          { type: 'import-tree', dock: 'toolbar', props: { permAction: 'import' } },
          { type: 'export-tree', dock: 'toolbar', props: { permAction: 'export' } },
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
    // children 不走权限过滤，全部渲染（权限逻辑由子组件自身处理）
    expect(wrapper.find('.spark-action-stub[data-type="delete-node"]').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="plain-node"]').exists()).toBe(true)
  })

  it('should reuse column configs as filter items and filter inline rows locally', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Filter-Local',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'name', type: 'string' as const }],
          rows: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 3, name: 'Alicia' },
          ] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        filterColumns: ['name'],
        children: [
          { type: 'r-text', props: { field: 'name', label: '姓名' } },
          { type: 'r-number', props: { field: 'age', label: '年龄' } },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          SparkComponentRenderer: SparkActionStub,
          RendererFieldScope: RendererFieldScopeStub,
        },
      },
    })

    const filterInput = wrapper.find('.renderer-filter-input[data-name="name"]')
    const filterScope = wrapper.find('.renderer-field-scope-stub')
    expect(filterInput.exists()).toBe(true)
    expect(filterInput.attributes('data-type')).toBe('r-text')
    expect(filterScope.attributes('data-auto-fit-min-width')).toBe('220px')
    expect(filterScope.attributes('data-default-col-span')).toBe('1')
    expect(wrapper.find('.renderer-filter-input[data-name="age"]').exists()).toBe(false)

    await filterInput.setValue('Ali')
    await nextTick()

    const vm = wrapper.vm as unknown as { tableData: IDataRow[] }
    expect(vm.tableData).toHaveLength(2)
    expect(vm.tableData.map(row => row['name'])).toEqual(['Alice', 'Alicia'])
  })

  it('should sync filter expression to data view and refresh remote tables', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Filter-Remote',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'name', type: 'string' as const }],
          rows: [{ id: 1, name: 'Alice' }] as IDataRow[]
        }
      }
    })

    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })
    const dv = ds.getView('Users', 'default')!
    const requestDataSpy = vi.spyOn(dv, 'requestData').mockResolvedValue(undefined)
    const setFilterSpy = vi.spyOn(dv, 'setFilter').mockResolvedValue(undefined)
    const refreshSpy = vi.spyOn(dv, 'refresh').mockResolvedValue(undefined)

    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        filterColumns: ['name'],
        children: [
          { type: 'r-text', props: { field: 'name', label: '姓名' } },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          SparkComponentRenderer: SparkActionStub,
          RendererFieldScope: RendererFieldScopeStub,
        },
      },
    })

    await nextTick()
    expect(setFilterSpy).not.toHaveBeenCalled()
    expect(refreshSpy).not.toHaveBeenCalled()

    await wrapper.find('.renderer-filter-input[data-name="name"]').setValue('Ali')
    await flushPromises()

    expect(setFilterSpy).toHaveBeenCalledWith({ field: 'name', op: 'contains', value: 'Ali' })
    expect(refreshSpy).toHaveBeenCalled()

    requestDataSpy.mockRestore()
    setFilterSpy.mockRestore()
    refreshSpy.mockRestore()
  })

  it('should infer between for range filters and in for multi-select filters', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Filter-Infer',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'score', type: 'number' as const },
            { name: 'status', type: 'string' as const },
          ],
          rows: [
            { id: 1, score: 10, status: 'draft' },
            { id: 2, score: 20, status: 'done' },
            { id: 3, score: 30, status: 'archived' },
          ] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        filterColumns: ['score', 'status'],
        children: [
          { type: 'r-number', props: { field: 'score', label: '分数', filterMode: 'range' } },
          { type: 'r-multi-select', props: { field: 'status', label: '状态' } },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          SparkComponentRenderer: SparkActionStub,
          RendererFieldScope: RendererFieldScopeStub,
        },
      },
    })

    const vm = wrapper.vm as unknown as { filterModel: Record<string, unknown>; tableData: IDataRow[] }
    vm.filterModel['score'] = [15, 25]
    await nextTick()
    expect(vm.tableData).toHaveLength(1)
    expect(vm.tableData[0]?.['score']).toBe(20)

    vm.filterModel['status'] = ['done', 'archived']
    await nextTick()
    expect(vm.tableData).toHaveLength(1)
    expect(vm.tableData[0]?.['status']).toBe('done')
  })

  it('should support collapsible filter panel and default collapsed state', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Filter-Collapsible',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'name', type: 'string' as const }],
          rows: [{ id: 1, name: 'Alice' }] as IDataRow[]
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mount(RendererTable as any, {
      props: {
        dataView: dv,
        filterColumns: ['name'],
        filterCollapsible: true,
        filterDefaultCollapsed: true,
        children: [
          { type: 'r-text', props: { field: 'name', label: '姓名' } },
        ],
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-tag': defineComponent({
            setup(_, { slots }) {
              return () => h('span', { class: 'el-tag-stub' }, slots['default']?.())
            },
          }),
          SparkComponentRenderer: SparkActionStub,
          RendererFieldScope: RendererFieldScopeStub,
        },
      },
    })

    const toggle = wrapper.find('.renderer-table-filters__toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    const filterContent = wrapper.find('.renderer-table-filters__content')
    expect(filterContent.exists()).toBe(true)
    expect((filterContent.element as HTMLElement).style.display).toBe('none')

    await toggle.trigger('click')
    await nextTick()

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect((filterContent.element as HTMLElement).style.display).not.toBe('none')
    expect(wrapper.find('.renderer-field-scope-stub').exists()).toBe(true)
    expect(wrapper.find('.renderer-filter-input[data-name="name"]').exists()).toBe(true)
  })
})
