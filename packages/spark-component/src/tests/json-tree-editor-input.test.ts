import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, type PropType, type VNode } from 'vue'
import JsonTreeEditor from '../components/editors/JsonTreeEditor.vue'

const VxeTableStub = defineComponent({
  name: 'VxeTable',
  props: {
    data: {
      type: Array as PropType<Array<Record<string, unknown>>>,
      default: () => [],
    },
  },
  emits: ['current-row-change'],
  setup(props, { emit, expose, slots }) {
    expose({
      getTreeExpandRecords: () => [],
      clearTreeExpand: () => Promise.resolve(),
      setTreeExpand: () => Promise.resolve(),
      setAllTreeExpand: () => Promise.resolve(),
      setCurrentRow: (row: Record<string, unknown>) => {
        emit('current-row-change', { newValue: row })
      },
    })

    return () => h('div', { class: 'vxe-table-stub' }, renderColumnSlots(slots['default']?.() ?? [], props.data))
  },
})

const VxeColumnStub = defineComponent({
  name: 'VxeColumn',
  setup(_props, { slots }) {
    return () => h('div', slots['default']?.({ row: {} }))
  },
})

const ElInputStub = defineComponent({
  name: 'ElInput',
  props: {
    modelValue: {
      type: [String, Number] as PropType<string | number | undefined>,
      default: '',
    },
    readonly: Boolean,
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit, slots }) {
    return () => h('input', {
      class: 'el-input-stub',
      readonly: props.readonly,
      value: props.modelValue ?? '',
      onInput: (event: Event) => {
        emit('update:modelValue', (event.target as HTMLInputElement).value)
      },
      onChange: (event: Event) => {
        emit('change', (event.target as HTMLInputElement).value)
      },
    }, slots['prefix']?.())
  },
})

function renderColumnSlots(
  columns: VNode[],
  rows: Array<Record<string, unknown>>,
): VNode[] {
  return columns.flatMap((column) => {
    const children = column.children as { default?: (scope: { row: Record<string, unknown> }) => VNode[] } | null
    if (typeof children?.['default'] !== 'function') return []
    return rows.map(row => h('div', { class: 'vxe-row-stub' }, children['default']?.({ row })))
  })
}

function mountEditor() {
  return mount(JsonTreeEditor, {
    props: {
      modelValue: JSON.stringify({ title: 'hello' }, null, 2),
    },
    global: {
      stubs: {
        'vxe-table': VxeTableStub,
        'vxe-column': VxeColumnStub,
        'el-input': ElInputStub,
        'el-select': true,
        'el-option': true,
        'el-switch': true,
        'el-tag': true,
        'el-input-number': true,
        'el-button': true,
      },
    },
  })
}

async function activateTitleRow(wrapper: ReturnType<typeof mountEditor>) {
  await nextTick()
  await nextTick()
  const table = wrapper.findComponent(VxeTableStub)
  const titleRow = (table.props('data') as Array<Record<string, unknown>>).find(row => row['displayKey'] === 'title')
  expect(titleRow).toBeTruthy()
  table.vm.$emit('current-row-change', { newValue: titleRow })
  await nextTick()
}

describe('JsonTreeEditor inline input', () => {
  it('keeps a string value responsive while typing and commits on change', async () => {
    const wrapper = mountEditor()
    await activateTitleRow(wrapper)

    const valueInput = wrapper.findAllComponents(ElInputStub)
      .find(input => input.props('modelValue') === 'hello')
    expect(valueInput).toBeTruthy()

    valueInput?.vm.$emit('update:modelValue', 'world')
    await nextTick()

    expect(valueInput?.props('modelValue')).toBe('world')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    valueInput?.vm.$emit('change', 'world')
    await nextTick()

    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0]
    expect(JSON.parse(String(emitted))).toEqual({ title: 'world' })

    valueInput?.vm.$emit('change', 'world')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('keeps an object key responsive while typing and commits on change', async () => {
    const wrapper = mountEditor()
    await activateTitleRow(wrapper)

    const keyInput = wrapper.findAllComponents(ElInputStub)
      .find(input => input.props('modelValue') === 'title')
    expect(keyInput).toBeTruthy()

    keyInput?.vm.$emit('update:modelValue', 'heading')
    await nextTick()

    expect(keyInput?.props('modelValue')).toBe('heading')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    keyInput?.vm.$emit('change', 'heading')
    await nextTick()

    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0]
    expect(JSON.parse(String(emitted))).toEqual({ heading: 'hello' })
  })
})
