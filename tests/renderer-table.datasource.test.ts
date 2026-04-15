import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { RendererTable, RendererRowFragment, FieldText, DATA_ROW, PAGE_DATASET, Spark, useSparkComponent } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import type { IDataRow, DataView, IDataSet } from '@spark-view/spark-data'
import { defineComponent, h, nextTick } from 'vue'
import { mountWithDataView, mountWithPageDataSet } from './helpers/mount-with-page-dataset'
import { liftChildProps, type LiftAsLookup } from '../packages/spark-component/src/page/binding/build-page-children'
import type { SparkNode } from '@spark-view/spark-component'

function readConfigProps(config: Record<string, unknown>): Record<string, unknown> {
  const props = config['props']
  return props !== null && props !== undefined && typeof props === 'object' && !Array.isArray(props)
    ? props as Record<string, unknown>
    : {}
}

function readConfigOnMap(config: Record<string, unknown>): Record<string, unknown> | undefined {
  const propsMap = readConfigProps(config)
  const onMap = propsMap['on']
  if (onMap !== null && onMap !== undefined && typeof onMap === 'object' && !Array.isArray(onMap)) {
    return onMap as Record<string, unknown>
  }

  const legacyOn = config['on']
  return legacyOn !== null && legacyOn !== undefined && typeof legacyOn === 'object' && !Array.isArray(legacyOn)
    ? legacyOn as Record<string, unknown>
    : undefined
}

function readConfigActionText(config: Record<string, unknown>): string {
  const propsMap = readConfigProps(config)
  const label = propsMap['label']
  if (typeof label === 'string' && label.length > 0) return label

  const children = config['children']
  if (Array.isArray(children)) {
    const firstText = children.find((item): item is string => typeof item === 'string' && item.length > 0)
    if (firstText !== undefined) return firstText
  }

  return String(config['type'] ?? '')
}

const SparkActionStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const config = props.config as Record<string, unknown>
      const propsMap = readConfigProps(config)
      const onMap = readConfigOnMap(config)
      const click = onMap?.['click']
      const type = String(config['type'] ?? '')
      const isButtonLike = type === 'r-button' || type === 'el-button'

      return h('button', {
        class: isButtonLike ? 'el-button-stub' : 'spark-action-stub',
        'data-type': type,
        'data-row-id': String((propsMap['row'] as Record<string, unknown> | undefined)?.['id'] ?? ''),
        'data-row-index': String((propsMap['rowIndex'] as number | undefined) ?? ''),
        'data-node-id': String((propsMap['data'] as Record<string, unknown> | undefined)?.['id'] ?? ''),
        disabled: propsMap['disabled'] === true || propsMap['buttonDisabled'] === true,
        onClick: () => {
          if (typeof click === 'function') click('evt')
        },
      }, readConfigActionText(config))
    }
  }
})

const ElTableStub = defineComponent({
  emits: ['row-click', 'selection-change'],
  props: {
    data: {
      type: Array,
      default: () => [],
    },
    rowKey: {
      type: [String, Function],
      default: undefined,
    },
    treeProps: {
      type: Object,
      default: undefined,
    },
  },
  setup(props, { slots, emit }) {
    return () => {
      const rows = Array.isArray(props.data) ? props.data as Array<Record<string, unknown>> : []
      const firstRow = rows[0]
      const firstChildren = Array.isArray(firstRow?.['children']) ? firstRow['children'] as Array<Record<string, unknown>> : []
      return h('div', {
        class: 'el-table-stub',
        'data-row-count': String(rows.length),
        'data-row-key': typeof props.rowKey === 'string' ? props.rowKey : '',
        'data-tree-children-field': String((props.treeProps as Record<string, unknown> | undefined)?.['children'] ?? ''),
        'data-first-row-id': String(firstRow?.['id'] ?? ''),
        'data-first-children-count': String(firstChildren.length),
      }, [
        h('button', {
          class: 'el-table-row-click-trigger',
          type: 'button',
          onClick: () => {
            if (firstRow) emit('row-click', firstRow)
          },
        }, 'row-click'),
        h('button', {
          class: 'el-table-selection-trigger',
          type: 'button',
          onClick: () => {
            emit('selection-change', firstRow ? [firstRow] : [])
          },
        }, 'selection-change'),
        slots['default']?.(),
      ])
    }
  }
})

const ElTableColumnStub = defineComponent({
  props: {
    label: String,
    width: [String, Number],
    minWidth: [String, Number],
    align: String,
    headerAlign: String,
    className: String,
    fixed: [Boolean, String],
  },
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-table-column-stub',
      'data-label': props.label,
      'data-width': String(props.width ?? ''),
      'data-min-width': String(props.minWidth ?? ''),
      'data-align': String(props.align ?? ''),
      'data-header-align': String(props.headerAlign ?? ''),
      'data-class-name': String(props.className ?? ''),
      'data-fixed': String(props.fixed ?? ''),
    }, slots['default']?.({ row: { id: 7, name: 'Alice' }, $index: 2 }))
  }
})

const TableRowFragmentProbe = defineComponent({
  setup() {
    const { sparkConsume } = useSparkComponent({ type: 'row-fragment-probe' } as SparkNode)
    const row = sparkConsume(DATA_ROW)

    return () => h('div', {
      class: 'row-fragment-probe',
      'data-row-name': String(row?.['name'] ?? ''),
    }, String(row?.['name'] ?? ''))
  },
})

const TableRowFragmentIconProbe = defineComponent({
  setup() {
    const { sparkConsume } = useSparkComponent({ type: 'row-fragment-icon-probe' } as SparkNode)
    const row = sparkConsume(DATA_ROW)

    return () => h('i', {
      class: 'row-fragment-icon-probe',
      'data-icon': String(row?.['icon'] ?? ''),
    })
  },
})

const TableRowFragmentLinkProbe = defineComponent({
  setup() {
    const { sparkConsume } = useSparkComponent({ type: 'row-fragment-link-probe' } as SparkNode)
    const row = sparkConsume(DATA_ROW)

    return () => h('a', {
      class: 'row-fragment-link-probe',
      href: String(row?.['href'] ?? ''),
      target: '_blank',
    }, String(row?.['label'] ?? ''))
  },
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

const ElFormItemStub = defineComponent({
  props: {
    label: String,
    prop: String,
  },
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-form-item-stub',
      'data-label': props.label ?? '',
      'data-prop': props.prop ?? '',
    }, slots['default']?.())
  },
})

const ElInputStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('input', {
      class: 'el-input-stub',
      value: props.modelValue,
      disabled: props.disabled,
    })
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

const TableColumnGroupStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
    label: String,
    children: {
      type: Array,
      default: () => [],
    },
  },
  setup(props) {
    return () => {
      const config = props.config as Record<string, unknown>
      const configProps = (config['props'] as Record<string, unknown> | undefined) ?? {}
      const children = Array.isArray(props.children) && props.children.length > 0
        ? props.children
        : ((config['children'] as unknown[]) ?? [])

      return h(ElTableColumnStub, {
        label: props.label ?? String(configProps['label'] ?? ''),
      }, () => children.map((child, index) => h(SparkColumnRendererStub, {
        key: index,
        config: child as Record<string, unknown>,
      })))
    }
  },
})

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
        'r-column-group': TableColumnGroupStub,
      }
      const component = componentMap[type]
      if (component) {
        return h(component as never, {
          config,
          ...(type === 'r-column-group' && { children: ((config['children'] as unknown[]) ?? []) }),
          ...((config['props'] as Record<string, unknown> | undefined) ?? {}),
        })
      }
      // 非列组件回退为 action stub（toolbar / row-actions 等）
      const propsMap = readConfigProps(config)
      const onMap = readConfigOnMap(config)
      const click = onMap?.['click']
      const typeLabel = readConfigActionText(config)
      const actionType = String(config['type'] ?? '')
      const isButtonLike = actionType === 'r-button' || actionType === 'el-button'
      return h('button', {
        class: isButtonLike ? 'el-button-stub' : 'spark-action-stub',
        'data-type': actionType,
        'data-row-id': String((propsMap['row'] as Record<string, unknown> | undefined)?.['id'] ?? ''),
        'data-row-index': String((propsMap['rowIndex'] as number | undefined) ?? ''),
        'data-node-id': String((propsMap['data'] as Record<string, unknown> | undefined)?.['id'] ?? ''),
        disabled: propsMap['disabled'] === true || propsMap['buttonDisabled'] === true,
        onClick: () => { if (typeof click === 'function') click('evt') },
      }, typeLabel)
    }
  }
})

const ElTreeStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-tree-stub' }, slots['default']?.({ node: { level: 1 }, data: { id: 'node-1', label: '节点 1' } }))
  }
})

const ElTreeInteractiveStub = defineComponent({
  emits: ['node-click', 'node-expand', 'node-collapse'],
  setup(_, { slots, emit }) {
    const treeData = { id: 'node-1', label: '节点 1' }
    const treeNode = { level: 1, expanded: false }
    const treeComponent = { stub: true }
    return () => h('div', { class: 'el-tree-interactive-stub' }, [
      h('button', {
        class: 'tree-click-trigger',
        onClick: () => emit('node-click', treeData, treeNode, treeComponent),
      }, 'click'),
      h('button', {
        class: 'tree-expand-trigger',
        onClick: () => emit('node-expand', treeData, treeNode, treeComponent),
      }, 'expand'),
      h('button', {
        class: 'tree-collapse-trigger',
        onClick: () => emit('node-collapse', treeData, treeNode, treeComponent),
      }, 'collapse'),
      slots['default']?.({ node: treeNode, data: treeData }),
    ])
  }
})

const ElTreeDropStub = defineComponent({
  emits: ['node-drop'],
  setup(_, { slots, emit }) {
    const rootData = { id: 'root', label: '根节点', parentId: null }
    const leafData = { id: 'leaf', label: '叶子节点', parentId: null }
    const rootNode = { level: 1, expanded: true, data: rootData }
    const dragNode = { level: 2, expanded: false, data: leafData }
    return () => h('div', { class: 'el-tree-drop-stub' }, [
      h('button', {
        class: 'tree-drop-trigger',
        onClick: () => emit('node-drop', dragNode, rootNode, 'inner'),
      }, 'drop'),
      slots['default']?.({ node: rootNode, data: rootData }),
    ])
  },
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

function createInlineDataSet(tableName: string, rows: IDataRow[]): IDataSet {
  const sample = rows[0] ?? {}
  const columns = Object.keys(sample).map((name) => ({
    name,
    type: typeof sample[name] === 'number' ? 'number' as const : 'string' as const,
  }))

  return SparkData.createDataSet({
    dataSetName: `TestDS-${tableName}`,
    tables: {
      [tableName]: {
        tableName,
        columns,
        views: {
          default: {
            rows,
          },
        },
      },
    },
  })
}

const TEST_LIFT_AS_MAP: Record<string, string> = {
  'r-toolbar': 'toolbar',
  'r-actions': 'actions',
  'r-filter': 'filter',
  'r-editor': 'editor',
}
const testGetLiftAs: LiftAsLookup = (type) => TEST_LIFT_AS_MAP[type]

function liftTestChildProps(containerType: string, props: Record<string, unknown>): Record<string, unknown> {
  if (!props['children']) return props
  const node = liftChildProps({ type: containerType, children: props['children'] as SparkNode[] }, testGetLiftAs)
  const { children: _, ...rest } = props
  return { ...rest, ...node.props, ...(node.children?.length ? { children: node.children } : {}) }
}

function mountRendererTableWithView(
  view: DataView,
  props: Record<string, unknown> = {},
  options: { global?: Record<string, unknown>; slots?: Record<string, unknown> } = {},
) {
  const mountOptions = {
    view,
    field: 'rows',
    props: liftTestChildProps('r-table', props),
  } as {
    view: DataView
    field: 'rows'
    props: Record<string, unknown>
    global?: Record<string, unknown>
    slots?: Record<string, unknown>
  }

  if (options.global) {
    mountOptions.global = options.global
  }
  if (options.slots) {
    mountOptions.slots = options.slots
  }

  return mountWithDataView(RendererTable as any, mountOptions)
}

async function mountRendererTreeWithView(
  view: DataView,
  props: Record<string, unknown> = {},
  options: { global?: Record<string, unknown>; slots?: Record<string, unknown> } = {},
) {
  const { RendererTree } = await import('@spark-view/spark-component')
  const mountOptions = {
    view,
    field: 'rows',
    props: liftTestChildProps('r-tree', props),
  } as {
    view: DataView
    field: 'rows'
    props: Record<string, unknown>
    global?: Record<string, unknown>
    slots?: Record<string, unknown>
  }

  if (options.global) {
    mountOptions.global = options.global
  }
  if (options.slots) {
    mountOptions.slots = options.slots
  }

  return mountWithDataView(RendererTree as any, mountOptions)
}

describe('RendererTable - DataView as single data intermediary', () => {
  const silentWarnHandler = () => undefined
  let consoleErrorSpy: { mockRestore(): void } | null = null

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    await flushPromises()
    await nextTick()
    consoleErrorSpy?.mockRestore()
    consoleErrorSpy = null
  })


  it('should allow direct Vue children to render R columns inside RendererTable slot', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'TableDirectVueDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }],
            },
          },
        },
      },
    })

    const DirectTableColumns = defineComponent({
      name: 'DirectTableColumns',
      setup() {
        return () => h(FieldText as any, {
          type: 'r-text',
          field: 'name',
          label: '姓名',
        })
      },
    })

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@rows',
      },
      slots: {
        default: () => h(DirectTableColumns),
      },
      global: {
        stubs: {
          'el-form-item': ElFormItemStub,
          'el-input': ElInputStub,
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
        },
      },
    })

    expect(wrapper.find('.el-table-column-stub[data-label="姓名"]').exists()).toBe(true)
    expect(wrapper.find('.field-display').exists()).toBe(false)
  })

  it('should bind dataKey and react to DataView changes', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' as const }],
          views: {
            default: {
              rows: [{ id: 1 }, { id: 2 }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mountRendererTableWithView(dv)

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
          views: {
            default: {
              rows: [] as IDataRow[],
            },
          },
        }
      }
    })

    // tryAutoLoad only fires when table has API config
    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })

    const dv = ds.getView('Users', 'default')!
    // spy on requestData (tryAutoLoad calls this)
    const spy = vi.spyOn(dv, 'requestData').mockResolvedValue(undefined)

    mountRendererTableWithView(dv)
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
          views: {
            default: {
              rows: [{ id: 1 }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const spy = vi.spyOn(dv, 'requestData').mockResolvedValue(undefined)

    mountRendererTableWithView(dv)
    await nextTick()

    // 内联数据表无 API，tryAutoLoad 应跳过
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })

  it('RendererTree should call requestData() on mount when rows empty', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'number' as const }],
          views: {
            default: {
              rows: [] as IDataRow[],
            },
          },
        }
      }
    })

    // tryAutoLoad only fires when table has API config
    ds.getTable('Nodes')!.setApi({ list: { url: '/api/nodes', method: 'GET' } })

    const dv = ds.getView('Nodes', 'default')!
    // RendererTree calls requestData() → loadFromServer(); spy on requestData directly
    const spy = vi.spyOn(dv, 'requestData').mockResolvedValue(undefined)

    await mountRendererTreeWithView(dv, {}, {
      global: {
        stubs: { 'el-tree': { template: '<div><slot :node="{}" :data="{}" /></div>' } }
      },
    })
    await nextTick()

    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('RendererTree should run business click handler before Vue auto handling', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3-Click-Order',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          views: {
            default: {
              rows: [{ id: 'node-1', label: '节点 1' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Nodes', 'default')!
    const setCurrentRowByIdSpy = vi.spyOn(dv, 'setCurrentRowById')
    const observed: string[] = []

    const wrapper = await mountRendererTreeWithView(dv, {
      onNodeClick: async (_data: unknown, _node: unknown, _component: unknown, control: { cancel: boolean }) => {
        observed.push(`biz:${String(dv.currentRow?.['id'] ?? 'null')}:${String(control.cancel)}`)
      },
    }, {
      global: {
        stubs: {
          'el-tree': ElTreeInteractiveStub,
          SparkComponentRenderer: SparkActionStub,
        }
      },
    })

    await wrapper.find('.tree-click-trigger').trigger('click')
    await flushPromises()
    await nextTick()

    expect(observed).toEqual(['biz:null:false'])
    expect(setCurrentRowByIdSpy).toHaveBeenCalledTimes(1)
    expect(setCurrentRowByIdSpy).toHaveBeenCalledWith('node-1')
    expect(dv.currentRow?.['id']).toBe('node-1')
  })

  it('RendererTree should support async business handler and skip Vue auto handling when cancel is true', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3-Click-Cancel',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          views: {
            default: {
              rows: [{ id: 'node-1', label: '节点 1' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Nodes', 'default')!
    const setCurrentRowByIdSpy = vi.spyOn(dv, 'setCurrentRowById')
    const wrapper = await mountRendererTreeWithView(dv, {
      onNodeClick: async (_data: unknown, _node: unknown, _component: unknown, control: { cancel: boolean }) => {
        await Promise.resolve()
        control.cancel = true
      },
    }, {
      global: {
        stubs: {
          'el-tree': ElTreeInteractiveStub,
          SparkComponentRenderer: SparkActionStub,
        }
      },
    })

    await wrapper.find('.tree-click-trigger').trigger('click')
    await flushPromises()
    await nextTick()

    expect(setCurrentRowByIdSpy).not.toHaveBeenCalled()
    expect(dv.currentRow).toBeNull()
  })

  it('RendererTree should support async expand and collapse handlers with cancel control', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3-Expand-Collapse',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          views: {
            default: {
              rows: [{ id: 'node-1', label: '节点 1' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Nodes', 'default')!
    const observed: string[] = []
    const wrapper = await mountRendererTreeWithView(dv, {
      onNodeExpand: async (_data: unknown, _node: unknown, _component: unknown, control: { cancel: boolean }) => {
        await Promise.resolve()
        observed.push(`expand:${String(control.cancel)}`)
        control.cancel = true
      },
      onNodeCollapse: async (_data: unknown, _node: unknown, _component: unknown, control: { cancel: boolean }) => {
        await Promise.resolve()
        observed.push(`collapse:${String(control.cancel)}`)
      },
    }, {
      global: {
        stubs: {
          'el-tree': ElTreeInteractiveStub,
          SparkComponentRenderer: SparkActionStub,
        }
      },
    })

    await wrapper.find('.tree-expand-trigger').trigger('click')
    await flushPromises()
    await wrapper.find('.tree-collapse-trigger').trigger('click')
    await flushPromises()

    expect(observed).toEqual(['expand:false', 'collapse:false'])
  })

  it('RendererTree API should expand to target node through DataView and native tree', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3-Expand-To-Node',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          views: {
            default: {
              rows: [
                {
                  id: 'root',
                  label: '根节点',
                  children: [
                    { id: 'leaf', label: '叶子节点', children: [] },
                  ],
                },
              ] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Nodes', 'default')!
    const loadTreePathSpy = vi.spyOn(dv, 'loadTreePath').mockResolvedValue({ pathIds: ['root', 'leaf'] })
    const expandTreeToNodeSpy = vi.spyOn(dv, 'expandTreeToNode').mockResolvedValue(undefined)
    const expandRootSpy = vi.fn()
    const expandLeafSpy = vi.fn()
    const setCurrentKeySpy = vi.fn()

    const ExpandTreeStub = defineComponent({
      setup(_, { slots, expose }) {
        const treeData = {
          id: 'root',
          label: '根节点',
          children: [{ id: 'leaf', label: '叶子节点', children: [] }],
        }
        expose({
          setCurrentKey: setCurrentKeySpy,
          getNode: (key: string | number) => {
            if (key === 'root') return { expand: expandRootSpy, data: treeData }
            if (key === 'leaf') return { expand: expandLeafSpy, data: treeData.children[0] }
            return undefined
          },
        })
        return () => h('div', { class: 'el-tree-expand-api-stub' }, slots['default']?.({
          node: { level: 1 },
          data: treeData,
        }))
      },
    })

    const wrapper = await mountRendererTreeWithView(dv, {}, {
      global: {
        stubs: {
          'el-tree': ExpandTreeStub,
          SparkComponentRenderer: SparkActionStub,
        }
      },
    })

    const exposed = (wrapper.vm as { $?: { exposed?: { expandToNode?: (key: string | number) => Promise<void> } } }).$?.exposed
    expect(exposed?.expandToNode).toBeTypeOf('function')

    await exposed!.expandToNode!('leaf')
    await flushPromises()
    await nextTick()

    expect(loadTreePathSpy).toHaveBeenCalledWith('leaf')
    expect(expandTreeToNodeSpy).toHaveBeenCalledWith('leaf')
    expect(expandRootSpy).toHaveBeenCalledTimes(1)
    expect(expandLeafSpy).toHaveBeenCalledTimes(1)
    expect(setCurrentKeySpy).toHaveBeenCalledWith('leaf')
    expect(dv.currentRow?.['id']).toBe('leaf')
  })

  it('RendererTree should initialize selection and expansion by node ID', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3-Init-By-Id',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          views: {
            default: {
              rows: [
                {
                  id: 'root',
                  label: '根节点',
                  children: [
                    {
                      id: 'branch',
                      label: '分支节点',
                      children: [
                        { id: 'leaf', label: '叶子节点', children: [] },
                      ],
                    },
                  ],
                },
              ] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Nodes', 'default')!
    const expandRootSpy = vi.fn()
    const expandBranchSpy = vi.fn()
    const setCurrentKeySpy = vi.fn()

    const InitTreeStub = defineComponent({
      setup(_, { slots, expose }) {
        const leafNode = { id: 'leaf', label: '叶子节点', children: [] }
        const branchNode = {
          id: 'branch',
          label: '分支节点',
          children: [leafNode],
        }
        const treeData = {
          id: 'root',
          label: '根节点',
          children: [branchNode],
        }
        expose({
          setCurrentKey: setCurrentKeySpy,
          getNode: (key: string | number) => {
            if (key === 'root') return { expand: expandRootSpy, data: treeData }
            if (key === 'branch') return { expand: expandBranchSpy, data: branchNode }
            if (key === 'leaf') return { data: leafNode }
            return undefined
          },
        })
        return () => h('div', { class: 'el-tree-init-id-stub' }, slots['default']?.({
          node: { level: 1 },
          data: treeData,
        }))
      },
    })

    await mountRendererTreeWithView(dv, {
      currentKey: 'leaf',
      expandLevel: 2,
    }, {
      global: {
        stubs: {
          'el-tree': InitTreeStub,
          SparkComponentRenderer: SparkActionStub,
        }
      },
    })

    await flushPromises()
    await nextTick()

    expect(expandRootSpy).toHaveBeenCalledTimes(1)
    expect(expandBranchSpy).not.toHaveBeenCalled()
    expect(setCurrentKeySpy).toHaveBeenCalledWith('leaf')
    expect(dv.currentRow?.['id']).toBe('leaf')
  })

  it('RendererTree should rebuild nested UI from flat rows and persist zero-code node-drop move', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS3-Tree-Drop',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string' as const },
            { name: 'parentId', type: 'string' as const },
            { name: 'label', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [
                { id: 'root', parentId: null, label: '根节点' },
                { id: 'leaf', parentId: null, label: '叶子节点' },
              ] as IDataRow[],
              treeConfig: { idField: 'id', parentIdField: 'parentId', textField: 'label', treeMode: 'flat' },
            },
          },
        }
      }
    })

    ds.getTable('Nodes')!.setApi({ move: { url: '/api/tree/{id}/move', method: 'PUT' } })
    const dv = ds.getView('Nodes', 'default')!
    const moveSpy = vi.spyOn(dv, 'moveTreeNode').mockResolvedValue({ id: 'leaf', parentId: 'root', label: '叶子节点' } as IDataRow)

    const wrapper = await mountRendererTreeWithView(dv, {}, {
      global: {
        stubs: {
          'el-tree': ElTreeDropStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    await wrapper.find('.tree-drop-trigger').trigger('click')
    await flushPromises()

    expect(moveSpy).toHaveBeenCalledWith('leaf', 'root', -1)
  })

  it('RendererTable should rebuild nested tree-table data from flat rows when treeConfig exists', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Table-Tree',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string' as const, isPrimaryKey: true },
            { name: 'parentId', type: 'string' as const },
            { name: 'label', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [
                { id: 'root', parentId: null, label: '根节点' },
                { id: 'leaf', parentId: 'root', label: '叶子节点' },
              ] as IDataRow[],
              treeConfig: { idField: 'id', parentIdField: 'parentId', textField: 'label', treeMode: 'flat' },
            },
          },
        },
      },
    })

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: ds,
      props: {
        dataKey: 'Nodes@rows',
        children: [
          { type: 'r-text', props: { field: 'label', label: '名称' } },
        ],
      },
      global: {
        config: {
          warnHandler: silentWarnHandler,
        },
        components: {
          'r-text': TableTextFieldStub,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    const table = wrapper.find('.el-table-stub')
    expect(table.attributes('data-row-count')).toBe('1')
    expect(table.attributes('data-row-key')).toBe('id')
    expect(table.attributes('data-tree-children-field')).toBe('children')
    expect(table.attributes('data-first-row-id')).toBe('root')
    expect(table.attributes('data-first-children-count')).toBe('1')
  })

  it('should expose table CRUD api aligned with other data containers', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Table-CRUD',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const, isPrimaryKey: true },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] as IDataRow[],
            },
          },
        },
      },
    })

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@rows',
      },
      global: {
        config: {
          warnHandler: silentWarnHandler,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    const api = wrapper.vm.$.exposed as {
      getRows(): Array<Record<string, unknown>>
      getCurrentRow(): Record<string, unknown> | null
      getSelectedRows(): Array<Record<string, unknown>>
      query(): Promise<void>
      setCurrentRowById(id: number | null): boolean
      setSelectedRowsById(ids: Array<number | string>): number
      appendRow(row: Record<string, unknown>): void
      updateRowById(id: number, patch: Record<string, unknown>): boolean
      deleteRowById(id: number): boolean
      addRow(row: Record<string, unknown>): Promise<unknown>
      editRowById(id: number, patch: Record<string, unknown>): Promise<unknown>
      removeRow(id: number): Promise<unknown>
    }

    expect(api.getRows().map(row => row['id'])).toEqual([1, 2])
    expect(api.getCurrentRow()).toBeNull()
    expect(api.getSelectedRows()).toEqual([])

    expect(api.setCurrentRowById(2)).toBe(true)
    await nextTick()
    expect(api.getCurrentRow()?.['id']).toBe(2)

    expect(api.setSelectedRowsById([2])).toBe(1)
    await nextTick()
    expect(api.getSelectedRows().map(row => row['id'])).toEqual([2])

    api.appendRow({ id: 3, name: 'Carol' })
    await nextTick()
    expect(api.getRows().map(row => row['id'])).toEqual([1, 2, 3])

    expect(api.updateRowById(3, { name: 'Caroline' })).toBe(true)
    await nextTick()
    expect(api.getRows().find(row => row['id'] === 3)?.['name']).toBe('Caroline')

    expect(api.deleteRowById(1)).toBe(true)
    await nextTick()
    expect(api.getRows().map(row => row['id'])).toEqual([2, 3])

    await api.addRow({ id: 4, name: 'Dave' })
    await nextTick()
    expect(api.getRows().map(row => row['id'])).toEqual([2, 3, 4])

    await api.editRowById(4, { name: 'David' })
    await nextTick()
    expect(api.getRows().find(row => row['id'] === 4)?.['name']).toBe('David')

    await api.removeRow(4)
    await nextTick()
    expect(api.getRows().map(row => row['id'])).toEqual([2, 3])
  })

  it('should sync row click to current row selection', async () => {
    const ds = createInlineDataSet('Users', [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@rows',
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    const api = wrapper.vm.$.exposed as {
      getCurrentRow(): Record<string, unknown> | null
    }

    expect(api.getCurrentRow()).toBeNull()

    await wrapper.find('.el-table-row-click-trigger').trigger('click')
    await nextTick()

    expect(api.getCurrentRow()?.['id']).toBe(1)
  })

  it('should run table business handlers before default row and selection sync and allow cancel', async () => {
    const ds = createInlineDataSet('Users', [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])
    const view = ds.getView('Users', 'default')!
    const observed: string[] = []

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@rows',
        onRowClick: async (_row: unknown, _column: unknown, _event: unknown, control: { cancel: boolean }) => {
          observed.push(`row:${String(view.currentRow?.['id'] ?? 'null')}:${String(control.cancel)}`)
          control.cancel = true
        },
        onSelectionChange: async (_rows: unknown[], control: { cancel: boolean }) => {
          observed.push(`selection:${String(view.selectedRows.length)}:${String(control.cancel)}`)
          control.cancel = true
        },
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    await wrapper.find('.el-table-row-click-trigger').trigger('click')
    await nextTick()
    await wrapper.find('.el-table-selection-trigger').trigger('click')
    await nextTick()

    expect(observed).toEqual(['row:null:false', 'selection:0:false'])
    expect(view.currentRow).toBeNull()
    expect(view.selectedRows).toEqual([])
  })

  it('should run table CRUD business handlers before default methods and allow cancel', async () => {
    const ds = createInlineDataSet('Users', [{ id: 1, name: 'Alice' }])

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@rows',
        onAddRow: async (_row: Record<string, unknown>, control: { cancel: boolean }) => {
          control.cancel = true
        },
        onEditRow: async (_id: number, _patch: Record<string, unknown>, control: { cancel: boolean }) => {
          control.cancel = true
        },
        onRemoveRow: async (_id: number, control: { cancel: boolean }) => {
          control.cancel = true
        },
      },
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    const api = wrapper.vm.$.exposed as {
      addRow(row: Record<string, unknown>): Promise<Record<string, unknown>>
      editRowById(id: number, patch: Record<string, unknown>): Promise<Record<string, unknown>>
      removeRow(id: number): Promise<Record<string, unknown>>
      getRows(): Array<Record<string, unknown>>
    }

    await expect(api.addRow({ id: 2, name: 'Bob' })).resolves.toMatchObject({ success: false })
    await expect(api.editRowById(1, { name: 'Alice-2' })).resolves.toMatchObject({ success: false })
    await expect(api.removeRow(1)).resolves.toMatchObject({ success: false })
    expect(api.getRows().map(row => row['id'])).toEqual([1])
  })

  it('should expose remote tree api through tableApi for tree-table views', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Table-Tree-Remote',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string' as const, isPrimaryKey: true },
            { name: 'parentId', type: 'string' as const },
            { name: 'label', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [] as IDataRow[],
              treeConfig: { idField: 'id', parentIdField: 'parentId', textField: 'label', treeMode: 'flat' },
            },
          },
        },
      },
    })

    const view = ds.getView('Nodes', 'default')!
    const loadTreeNestedSpy = vi.spyOn(view, 'loadTreeNested').mockResolvedValue({
      success: true,
      data: [{ id: 'root', name: '根节点', parentId: null, label: '根节点', children: [] }],
    })
    const loadTreeChildrenSpy = vi.spyOn(view, 'loadTreeChildren').mockResolvedValue([{ id: 'root', name: '根节点', parentId: null, label: '根节点' }])
    const loadTreePathSpy = vi.spyOn(view, 'loadTreePath').mockResolvedValue({ pathIds: ['root', 'leaf'] })
    const expandTreeToNodeSpy = vi.spyOn(view, 'expandTreeToNode').mockImplementation(async () => {
      view.replaceRows([
        { id: 'root', parentId: null, label: '根节点' },
        { id: 'leaf', parentId: 'root', label: '叶子节点' },
      ])
    })
    const moveTreeNodeSpy = vi.spyOn(view, 'moveTreeNode').mockResolvedValue({ id: 'leaf', name: '叶子节点', parentId: 'root', label: '叶子节点' })
    const searchTreeNestedSpy = vi.spyOn(view, 'searchTreeNested').mockResolvedValue([
      { node: { id: 'leaf', name: '叶子节点', parentId: 'root', label: '叶子节点' }, path: [{ id: 'root', name: '根节点', parentId: null, label: '根节点' }] },
    ])
    const setCurrentRowByIdSpy = vi.spyOn(view.selection, 'setCurrentRowById')

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: ds,
      props: {
        dataKey: 'Nodes@rows',
      },
      global: {
        config: {
          warnHandler: silentWarnHandler,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    const api = wrapper.vm.$.exposed as {
      loadTreeNested(rootId?: string | number | null, limit?: number, depthLimit?: number): Promise<unknown>
      loadTreeChildren(parentId: string | number | null, limit?: number): Promise<Array<Record<string, unknown>>>
      loadTreePath(id: string | number): Promise<{ pathIds: Array<string | number> } | null>
      expandToNode(key: string | number): Promise<void>
      moveNode(nodeId: string | number, newParentId: string | number | null, index?: number): Promise<Record<string, unknown> | null>
      searchTreeNested(keyword: string, limit?: number): Promise<Array<Record<string, unknown>>>
    }

    await expect(api.loadTreeNested(null, 20, 3)).resolves.toEqual({
      success: true,
      data: [{ id: 'root', parentId: null, label: '根节点', children: [] }],
    })
    expect(loadTreeNestedSpy).toHaveBeenCalledWith(null, 20, 3)

    await expect(api.loadTreeChildren(null, 20)).resolves.toEqual([{ id: 'root', parentId: null, label: '根节点' }])
    expect(loadTreeChildrenSpy).toHaveBeenCalledWith(null, 20)

    await expect(api.loadTreePath('leaf')).resolves.toEqual({ pathIds: ['root', 'leaf'] })
    expect(loadTreePathSpy).toHaveBeenCalledWith('leaf')

    await api.expandToNode('leaf')
    expect(expandTreeToNodeSpy).toHaveBeenCalledWith('leaf')
    expect(setCurrentRowByIdSpy).toHaveBeenCalledWith('leaf')

    await expect(api.moveNode('leaf', 'root', -1)).resolves.toEqual({ id: 'leaf', parentId: 'root', label: '叶子节点' })
    expect(moveTreeNodeSpy).toHaveBeenCalledWith('leaf', 'root', -1)

    await expect(api.searchTreeNested('叶', 10)).resolves.toEqual([
      { node: { id: 'leaf', parentId: 'root', label: '叶子节点' }, path: [{ id: 'root', parentId: null, label: '根节点' }] },
    ])
    expect(searchTreeNestedSpy).toHaveBeenCalledWith('叶', 10)
  })

  it('should direct table CRUD to remote when create update delete API is configured', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Table-Remote-CRUD',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const, isPrimaryKey: true },
            { name: 'name', type: 'string' as const },
          ],
          api: {
            create: { url: '/api/users', method: 'POST' },
            update: { url: '/api/users/{id}', method: 'PUT' },
            delete: { url: '/api/users/{id}', method: 'DELETE' },
          },
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        },
      },
    })

    const httpClient = {
      get: vi.fn(),
      post: vi.fn(async () => ({ id: 2, name: 'Bob' })),
      put: vi.fn(async () => ({ id: 1, name: 'Alice-2' })),
      delete: vi.fn(async () => true),
    }
    ds.setSharedHttpClient(httpClient as never)

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: ds,
      props: {
        dataKey: 'Users@rows',
      },
      global: {
        config: {
          warnHandler: silentWarnHandler,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        },
      },
    })

    const api = wrapper.vm.$.exposed as {
      getRows(): Array<Record<string, unknown>>
      addRow(row: Record<string, unknown>): Promise<unknown>
      editRowById(id: number, patch: Record<string, unknown>): Promise<unknown>
      removeRow(id: number): Promise<unknown>
    }

    await expect(api.addRow({ id: 2, name: 'Bob' })).resolves.toMatchObject({ success: true, data: { id: 2, name: 'Bob' } })
    expect(httpClient.post).toHaveBeenCalledOnce()
    expect(api.getRows().map(row => row['id'])).toEqual([1, 2])

    await expect(api.editRowById(1, { name: 'Alice-2' })).resolves.toMatchObject({ success: true, data: { id: 1, name: 'Alice-2' } })
    expect(httpClient.put).toHaveBeenCalledOnce()
    expect(api.getRows().find(row => row['id'] === 1)?.['name']).toBe('Alice-2')

    await expect(api.removeRow(2)).resolves.toMatchObject({ success: true, data: true })
    expect(httpClient.delete).toHaveBeenCalledOnce()
    expect(api.getRows().map(row => row['id'])).toEqual([1])
  })

  it('should render table toolbar from children and scoped row actions', async () => {
    const rowActionSpy = vi.fn()

    const toolbarDataSet = createInlineDataSet('Users', [{ id: 1 }])
    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: toolbarDataSet,
      props: liftTestChildProps('r-table', {
        dataKey: 'Users@rows',
        children: [
          { type: 'r-toolbar', props: { position: 'bottom' }, children: [{ type: 'toolbar-button' }] },
          { type: 'r-actions', props: { position: 'left' }, children: [{ type: 'row-button', on: { click: rowActionSpy } }] },
        ],
      }),
      global: {
        config: {
          warnHandler: silentWarnHandler,
        },
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
      },
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        }
      }
    })

    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })
    const dv = ds.getView('Users', 'default')!
    const refreshSpy = vi.spyOn(dv, 'refresh').mockResolvedValue(undefined)

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'append-row',
                label: '新增',
                appendPayload: { id: 2, name: 'Bob' },
                successMessage: '',
              },
            },
            {
              type: 'r-button',
              props: {
                action: 'refresh',
                label: '刷新',
                successMessage: '',
              },
            },
          ],
        },
      ],
    }, {
      global: {
        config: {
          warnHandler: silentWarnHandler,
        },
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const refreshSpy = vi.spyOn(dv, 'refresh').mockResolvedValue(undefined)

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'refresh',
                label: '刷新',
                silent: true,
              },
            },
          ],
        },
      ],
    }, {
      global: {
        config: {
          warnHandler: silentWarnHandler,
        },
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'append-row',
                label: '新增',
                appendPayload: { id: 2, name: 'Bob' },
                successMessage: '',
              },
            },
          ],
        },
      ],
    }, {
      global: {
        config: {
          warnHandler: silentWarnHandler,
        },
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
          views: {
            default: {
              rows: [{ id: 7, name: 'Alice' }, { id: 8, name: 'Bob' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-actions',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'delete-row',
                label: '删除',
                successMessage: '',
                confirmMessage: '',
              },
            },
          ],
        },
      ],
    }, {
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Carol' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    dv.selection.setSelectedRows([dv.rows[0]!, dv.rows[2]!])

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'delete-selected',
                label: '删除勾选',
                successMessage: '',
                confirmMessage: '',
              },
            },
          ],
        },
      ],
    }, {
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'append-row',
                label: '新增静默',
                appendPayload: { id: 2, name: 'Bob' },
                silent: true,
              },
            },
          ],
        },
      ],
    }, {
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        }
      }
    })

    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })
    const dv = ds.getView('Users', 'default')!
    const refreshSpy = vi.spyOn(dv, 'refresh').mockRejectedValue(new Error('network down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'refresh',
                label: '刷新',
                errorMessage: '刷新失败',
              },
            },
          ],
        },
      ],
    }, {
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    dv.selection.setSelectedRows([dv.rows[0]!])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'delete-selected',
                label: '删除勾选',
                idField: 'uid',
                confirmMessage: '',
                failureMessage: '没有可删除记录',
              },
            },
          ],
        },
      ],
    }, {
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

  it('should render tree toolbar from children and scoped node actions', async () => {
    const nodeActionSpy = vi.fn()

    const { RendererTree } = await import('@spark-view/spark-component')
    const wrapper = mount(RendererTree as any, {
      props: liftTestChildProps('r-tree', {
        data: [{ id: 'node-1', label: '节点 1' }],
        children: [
          { type: 'r-toolbar', props: { position: 'right' }, children: [{ type: 'tree-toolbar' }] },
          { type: 'node-button', on: { click: nodeActionSpy } },
        ],
      }),
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

  it('should execute tree builtin toolbar actions without page script handlers', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Tree-Builtin-Toolbar',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string' as const, isPrimaryKey: true },
            { name: 'label', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 'node-1', label: '节点 1' }] as IDataRow[],
            },
          },
          api: { list: { url: '/api/nodes', method: 'GET' } },
        },
      },
    })

    const dv = ds.getView('Nodes', 'default')!
    const refreshSpy = vi.spyOn(dv, 'refresh').mockResolvedValue(undefined)

    const wrapper = await mountRendererTreeWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'refresh',
                label: '刷新导航树',
                successMessage: '',
              },
            },
          ],
        },
      ],
    }, {
      global: {
        stubs: {
          'el-tree': ElTreeStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    const toolbarButton = wrapper.find('.el-button-stub')
    expect(toolbarButton.exists()).toBe(true)

    await toolbarButton.trigger('click')
    await flushPromises()

    expect(refreshSpy).toHaveBeenCalledOnce()
  })

  it('should allow row-action slots and render toolbar children', () => {
    const slotDataSet = createInlineDataSet('Users', [{ id: 1 }])
    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: slotDataSet,
      props: liftTestChildProps('r-table', {
        dataKey: 'Users@rows',
        children: [{ type: 'r-toolbar', children: [{ type: 'biz-toolbar' }] }],
      }),
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

  it('should render primitive field configs as direct table columns', () => {
    const primitiveDataSet = createInlineDataSet('Users', [{ id: 1, name: 'Alice', score: 95, joinedAt: '2026-03-10' }])
    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: primitiveDataSet,
      props: {
        dataKey: 'Users@rows',
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
    const childrenDataSet = createInlineDataSet('Users', [{ id: 1, name: 'Alice', score: 95 }])
    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: childrenDataSet,
      props: {
        dataKey: 'Users@rows',
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

  it('should recurse grouped table columns through r-column-group children', () => {
    const groupedDataSet = createInlineDataSet('Users', [{ id: 1, province: '浙江', city: '杭州', score: 95 }])
    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: groupedDataSet,
      props: {
        dataKey: 'Users@rows',
        children: [
          {
            type: 'r-column-group',
            props: { label: '地址信息' },
            children: [
              {
                type: 'r-column-group',
                props: { label: '地区' },
                children: [
                  { type: 'r-text', props: { field: 'province', label: '省份' } },
                  { type: 'r-text', props: { field: 'city', label: '城市' } },
                ],
              },
              { type: 'r-number', props: { field: 'score', label: '分数' } },
            ],
          },
        ],
      },
      global: {
        components: {
          'r-text': TableTextFieldStub,
          'r-number': TableNumberFieldStub,
          'r-column-group': TableColumnGroupStub,
        },
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          SparkComponentRenderer: SparkColumnRendererStub,
        }
      }
    })

    const labels = wrapper.findAll('.el-table-column-stub').map(column => column.attributes('data-label'))
    expect(labels).toContain('地址信息')
    expect(labels).toContain('地区')
    expect(labels).toContain('省份')
    expect(labels).toContain('城市')
    expect(labels).toContain('分数')
  })

  it('should render r-row-fragment as a table column with row-scoped fragment content', () => {
    const fragmentDataSet = createInlineDataSet('Users', [{ id: 1, name: 'Alice' }])
    const registry = Spark.createRegistry()
    registry.register('r-row-fragment', RendererRowFragment)
    registry.register('row-fragment-probe', TableRowFragmentProbe)
    const plugin = Spark.createPlugin({ registry })

    const Harness = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'test-page-root' } as SparkNode)
        sparkProvide(PAGE_DATASET, fragmentDataSet)
        return () => h(RendererTable as never, {
          dataKey: 'Users@rows',
          children: [
            {
              type: 'r-row-fragment',
              props: {
                title: '用户摘要',
                width: 320,
                minWidth: 280,
                align: 'center',
                headerAlign: 'right',
                class: 'user-summary-col',
              },
              children: [
                { type: 'row-fragment-probe' },
              ],
            },
          ],
        })
      },
    })

    const wrapper = mount(Harness, {
      global: {
        plugins: [plugin],
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
        },
      },
    })

    const column = wrapper.find('.el-table-column-stub[data-label="用户摘要"]')
    expect(column.exists()).toBe(true)
    expect(column.attributes('data-width')).toBe('320')
    expect(column.attributes('data-min-width')).toBe('280')
    expect(column.attributes('data-align')).toBe('center')
    expect(column.attributes('data-header-align')).toBe('right')
    expect(column.attributes('data-class-name')).toBe('user-summary-col')
    expect(wrapper.find('.row-fragment-probe').attributes('data-row-name')).toBe('Alice')
    expect(wrapper.find('.row-fragment-probe').text()).toBe('Alice')
  })

  it('should render a minimal icon-and-link row fragment example from DATA_ROW', () => {
    const rowFixture = {
      id: 1,
      icon: 'ri-user-line',
      href: 'https://example.com/users/1',
      label: 'Alice profile',
    }
    const IconLinkTableColumnStub = defineComponent({
      props: {
        label: String,
        width: [String, Number],
        minWidth: [String, Number],
        align: String,
        headerAlign: String,
        className: String,
        fixed: [Boolean, String],
      },
      setup(props, { slots }) {
        return () => h('div', {
          class: 'el-table-column-stub',
          'data-label': props.label,
          'data-width': String(props.width ?? ''),
          'data-min-width': String(props.minWidth ?? ''),
          'data-align': String(props.align ?? ''),
          'data-header-align': String(props.headerAlign ?? ''),
          'data-class-name': String(props.className ?? ''),
          'data-fixed': String(props.fixed ?? ''),
        }, slots['default']?.({ row: rowFixture, $index: 2 }))
      },
    })
    const fragmentDataSet = createInlineDataSet('Users', [{
      id: 1,
      icon: rowFixture.icon,
      href: rowFixture.href,
      label: rowFixture.label,
    }])
    const registry = Spark.createRegistry()
    registry.register('r-row-fragment', RendererRowFragment)
    registry.register('row-fragment-icon-probe', TableRowFragmentIconProbe)
    registry.register('row-fragment-link-probe', TableRowFragmentLinkProbe)
    const plugin = Spark.createPlugin({ registry })

    const Harness = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'test-page-root' } as SparkNode)
        sparkProvide(PAGE_DATASET, fragmentDataSet)
        return () => h(RendererTable as never, {
          dataKey: 'Users@rows',
          children: [
            {
              type: 'r-row-fragment',
              props: {
                title: '入口',
                width: 220,
                fields: [
                  { type: 'row-fragment-icon-probe' },
                  { type: 'row-fragment-link-probe' },
                ],
              },
            },
          ],
        })
      },
    })

    const wrapper = mount(Harness, {
      global: {
        plugins: [plugin],
        stubs: {
          SparkComponentRenderer: false,
          'spark-component-renderer': false,
          'el-table': ElTableStub,
          'el-table-column': IconLinkTableColumnStub,
        },
      },
    })

    const column = wrapper.find('.el-table-column-stub[data-label="入口"]')
    expect(column.exists()).toBe(true)
    expect(column.attributes('data-width')).toBe('220')
    expect(column.find('.row-fragment-icon-probe').attributes('data-icon')).toBe('ri-user-line')

    const link = column.find('.row-fragment-link-probe')
    expect(link.attributes('href')).toBe('https://example.com/users/1')
    expect(link.text()).toBe('Alice profile')
  })

  it('should render tree toolbar children and content template', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Tree-Slots',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          views: {
            default: {
              rows: [{ id: 'node-1', label: '节点 1' }] as IDataRow[],
            },
          },
        }
      }
    })
    const dv = ds.getView('Nodes', 'default')!
    const wrapper = await mountRendererTreeWithView(dv, {
      children: [{ type: 'r-toolbar', children: [{ type: 'biz-tree-toolbar' }] }],
    }, {
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

  it('should render tree editor content on the configured side', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Tree-Editor',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          views: {
            default: {
              rows: [{ id: 'node-1', label: '节点 1' }] as IDataRow[],
            },
          },
        }
      }
    })
    const dv = ds.getView('Nodes', 'default')!
    const wrapper = await mountRendererTreeWithView(dv, {
      children: [
        { type: 'tree-node-content' },
        { type: 'r-editor', props: { position: 'right', class: 'tree-editor-panel' }, children: [{ type: 'tree-editor-template' }] },
      ],
    }, {
      global: {
        stubs: {
          'el-tree': ElTreeStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    expect(wrapper.find('.renderer-tree-body--editor-right').exists()).toBe(true)
    expect(wrapper.find('.renderer-tree-editor.tree-editor-panel').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="tree-editor-template"]').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="tree-node-content"]').exists()).toBe(true)
  })

  it('should hide toolbar actions by model permission and row actions by instance permission', async () => {
    const permissionDataSet = createInlineDataSet('Users', [{ id: 1 }])
    const permissionView = permissionDataSet.getView('Users', 'default')!
    ;(permissionView as { _modelPerm?: Record<string, unknown> })._modelPerm = { allowCreate: false, allowExport: true }

    const wrapper = mountWithPageDataSet(RendererTable as any, {
      dataSet: permissionDataSet,
      props: liftTestChildProps('r-table', {
        dataKey: 'Users@rows',
        children: [
          { type: 'r-toolbar', children: [
            { type: 'create-button', props: { permAction: 'create' } },
            { type: 'export-button', props: { permAction: 'export' } },
          ] },
          { type: 'r-actions', children: [
            { type: 'delete-row', props: { permAction: 'delete' } },
            { type: 'plain-row' },
          ] },
        ],
      }),
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
    const DeniedTreeStub = defineComponent({
      setup(_, { slots }) {
        return () => h('div', { class: 'el-tree-stub denied' }, slots['default']?.({
          node: { level: 1 },
          data: { id: 'node-2', label: '节点 2', _perm: { allowDelete: false, allowCreateChild: false } },
        }))
      }
    })

    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Tree-Perm',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [{ name: 'id', type: 'string' as const }, { name: 'label', type: 'string' as const }],
          views: {
            default: {
              rows: [{ id: 'node-2', label: '节点 2', _perm: { allowDelete: false, allowCreateChild: false } }] as IDataRow[],
            },
          },
        }
      }
    })
    const dv = ds.getView('Nodes', 'default')!
    // Inject _modelPerm on the DataView
    ;(dv as any)._modelPerm = { allowImport: false, allowCreate: false, allowExport: true }

    const wrapper = await mountRendererTreeWithView(dv, {
      children: [
        { type: 'r-toolbar', children: [
          { type: 'import-tree', props: { permAction: 'import' } },
          { type: 'export-tree', props: { permAction: 'export' } },
        ] },
        { type: 'r-actions', children: [
          { type: 'create-child-node', props: { permAction: 'create-child' } },
          { type: 'delete-node', props: { permAction: 'delete' } },
          { type: 'plain-node' },
        ] },
      ],
    }, {
      global: {
        stubs: {
          'el-tree': DeniedTreeStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    expect(wrapper.find('.spark-action-stub[data-type="import-tree"]').exists()).toBe(false)
    expect(wrapper.find('.spark-action-stub[data-type="export-tree"]').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="create-child-node"]').exists()).toBe(false)
    expect(wrapper.find('.spark-action-stub[data-type="delete-node"]').exists()).toBe(false)
    expect(wrapper.find('.spark-action-stub[data-type="plain-node"]').exists()).toBe(true)
  })

  it('should execute builtin tree append action with scope-row inheritance', async () => {
    const AllowedCreateChildTreeStub = defineComponent({
      setup(_, { slots }) {
        return () => h('div', { class: 'el-tree-stub allowed-create-child' }, slots['default']?.({
          node: { level: 1 },
          data: { id: 'node-1', label: '节点 1', _perm: { allowCreateChild: true } },
        }))
      }
    })

    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Tree-Builtin-Append',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string' as const },
            { name: 'label', type: 'string' as const },
            { name: 'parentId', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 'node-1', label: '节点 1', _perm: { allowCreateChild: true } }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Nodes', 'default')!
    ;(dv as { _modelPerm?: Record<string, unknown> })._modelPerm = { allowCreate: true }
    const wrapper = await mountRendererTreeWithView(dv, {
      children: [
        {
          type: 'r-actions',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'append-row',
                permAction: 'create-child',
                label: '新增子节点',
                setCurrentRowOnSuccess: true,
                appendPayload: { label: '新增节点' },
                inheritFieldMap: { parentId: 'id' },
                successMessage: '',
              },
            },
          ],
        },
      ],
    }, {
      global: {
        stubs: {
          'el-tree': AllowedCreateChildTreeStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkActionStub,
        }
      }
    })

    const button = wrapper.find('.el-button-stub')
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('新增子节点')

    await button.trigger('click')
    await flushPromises()

    expect(dv.rows).toHaveLength(2)
    expect(dv.rows[1]?.['label']).toBe('新增节点')
    expect(dv.rows[1]?.['parentId']).toBe('node-1')
    expect(dv.currentRow?.['label']).toBe('新增节点')
  })

  it('should apply onBeforeRender to builtin toolbar and row actions through SparkComponentRenderer', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Builtin-Before-Render',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        },
      },
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mountRendererTableWithView(dv, {
      children: [
        {
          type: 'r-toolbar',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'append-row',
                label: '隐藏工具栏动作',
                onBeforeRender: () => false,
              },
            },
          ],
        },
        {
          type: 'r-actions',
          children: [
            {
              type: 'r-button',
              props: {
                action: 'delete-row',
                label: '禁用行动作',
                onBeforeRender: ({ row }: { row?: IDataRow | null }) => ({ disabled: row !== null && row !== undefined }),
              },
            },
          ],
        },
      ],
    }, {
      global: {
        stubs: {
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          'el-button': ElButtonStub,
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    await flushPromises()
    await nextTick()

    const buttons = wrapper.findAll('.el-button-stub')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.text()).toBe('禁用行动作')
    expect((buttons[0]?.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('should reuse column configs as filter items and filter inline rows locally', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Filter-Local',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'name', type: 'string' as const }],
          views: {
            default: {
              rows: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
                { id: 3, name: 'Alicia' },
              ] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mountRendererTableWithView(dv, {
      children: [
        { type: 'r-text', props: { field: 'name', label: '姓名' } },
        { type: 'r-number', props: { field: 'age', label: '年龄' } },
        { type: 'r-filter', children: [{ type: 'r-text', props: { field: 'name', label: '姓名' } }] },
      ],
    }, {
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        }
      }
    })

    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })
    const dv = ds.getView('Users', 'default')!
    const requestDataSpy = vi.spyOn(dv, 'requestData').mockResolvedValue(undefined)
    const setFilterSpy = vi.spyOn(dv, 'setFilter').mockResolvedValue(undefined)
    const refreshSpy = vi.spyOn(dv, 'refresh').mockResolvedValue(undefined)

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        { type: 'r-text', props: { field: 'name', label: '姓名' } },
        { type: 'r-filter', children: [{ type: 'r-text', props: { field: 'name', label: '姓名' } }] },
      ],
    }, {
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
    await nextTick()

    expect(setFilterSpy).toHaveBeenCalledWith({ field: 'name', op: 'contains', value: 'Ali' })
    expect(refreshSpy).toHaveBeenCalled()

    requestDataSpy.mockRestore()
    setFilterSpy.mockRestore()
    refreshSpy.mockRestore()
  })

  it('should expose query api for remote filter refresh', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'RTDS-Filter-Query-Api',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'name', type: 'string' as const }],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        },
      },
    })

    ds.getTable('Users')!.setApi({ list: { url: '/api/users', method: 'GET' } })
    const dv = ds.getView('Users', 'default')!
    const refreshSpy = vi.spyOn(dv, 'refresh').mockResolvedValue(undefined)

    const wrapper = mountRendererTableWithView(dv, {
      children: [
        { type: 'r-filter', children: [{ type: 'r-text', props: { field: 'name', label: '姓名' } }] },
      ],
    }, {
      global: {
        stubs: {
          'el-table': ElTableStub,
          SparkComponentRenderer: SparkActionStub,
          RendererFieldScope: RendererFieldScopeStub,
        },
      },
    })

    const api = wrapper.vm.$.exposed as {
      query(): Promise<void>
    }

    await api.query()

    expect(refreshSpy).toHaveBeenCalledOnce()
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
          views: {
            default: {
              rows: [
                { id: 1, score: 10, status: 'draft' },
                { id: 2, score: 20, status: 'done' },
                { id: 3, score: 30, status: 'archived' },
              ] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mountRendererTableWithView(dv, {
      children: [
        { type: 'r-number', props: { field: 'score', label: '分数', filterMode: 'range' } },
        { type: 'r-multi-select', props: { field: 'status', label: '状态' } },
        { type: 'r-filter', children: [
          { type: 'r-number', props: { field: 'score', label: '分数', filterMode: 'range' } },
          { type: 'r-multi-select', props: { field: 'status', label: '状态' } },
        ] },
      ],
    }, {
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
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }] as IDataRow[],
            },
          },
        }
      }
    })

    const dv = ds.getView('Users', 'default')!
    const wrapper = mountRendererTableWithView(dv, {
      children: [
        { type: 'r-text', props: { field: 'name', label: '姓名' } },
        {
          type: 'r-filter',
          props: { collapsible: true, defaultCollapsed: true },
          children: [{ type: 'r-text', props: { field: 'name', label: '姓名' } }],
        },
      ],
    }, {
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
