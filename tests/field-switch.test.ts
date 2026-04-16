import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldSwitch } from '@spark-view/spark-component'
import type { DataColumn } from '@spark-view/spark-data'
import { mountFieldInContext } from './helpers/mount-field-in-context'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElSwitchStub = defineComponent({
  props: ['modelValue', 'disabled', 'activeText', 'inactiveText'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-switch-stub',
      'data-value': String(Boolean(props.modelValue)),
    })
  },
})

function mountFieldSwitch(
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
  columns?: DataColumn[],
) {
  return mountFieldInContext({
    component: FieldSwitch,
    type: 'r-switch',
    model,
    fieldName,
    componentProps,
    ...(columns !== undefined ? { dataSource: { columns } } : {}),
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-switch': ElSwitchStub,
        'el-table-column': defineComponent({
          setup() { return () => h('div', { class: 'el-table-column-stub' }) },
        }),
      },
    },
  })
}

describe('FieldSwitch 业务回调模式', () => {
  it('onChange 可在默认 syncValue 前执行并取消写回', async () => {
    const model = reactive<Record<string, unknown>>({ enabled: false })
    const observed: string[] = []
    const wrapper = mountFieldSwitch(model, 'enabled', {
      onChange: vi.fn((next: boolean, _prev: boolean, control: { cancel: boolean }) => {
        observed.push(`switch:${String(model['enabled'])}:${String(next)}:${String(control.cancel)}`)
        control.cancel = true
      }),
    })

    const switchComp = wrapper.findComponent(ElSwitchStub)
    switchComp.vm.$emit('update:modelValue', true)
    await nextTick()

    expect(observed).toEqual(['switch:false:true:false'])
    expect(model['enabled']).toBe(false)
  })

  it('应将可空布尔空值归一为 null', async () => {
    const model = reactive<Record<string, unknown>>({ dividerAfter: '' })

    mountFieldSwitch(model, 'dividerAfter', undefined, [
      { name: 'dividerAfter', type: 'boolean', allowDBNull: true },
    ])

    await nextTick()

    expect(model['dividerAfter']).toBeNull()
  })

  it('应将非可空布尔缺字段归一为 false', async () => {
    const model = reactive<Record<string, unknown>>({})

    mountFieldSwitch(model, 'hidden', undefined, [
      { name: 'hidden', type: 'boolean', allowDBNull: false },
    ])

    await nextTick()

    expect(model['hidden']).toBe(false)
  })

  it('应尊重组件 disabled 配置', async () => {
    const model = reactive<Record<string, unknown>>({ enabled: true })

    const wrapper = mountFieldSwitch(
      model,
      'enabled',
      { disabled: true },
      [{ name: 'enabled', type: 'boolean', allowDBNull: false }],
    )

    await nextTick()

    const switchComp = wrapper.findComponent(ElSwitchStub)
    expect(switchComp.props('disabled')).toBe(true)
  })

  it('无字段写权限时应保持禁用（默认只读）', async () => {
    const model = reactive<Record<string, unknown>>({ enabled: false })

    const wrapper = mountFieldSwitch(
      model,
      'enabled',
      undefined,
      [{ name: 'enabled', type: 'boolean', allowDBNull: false }],
    )

    await nextTick()

    const switchComp = wrapper.findComponent(ElSwitchStub)
    expect(switchComp.props('disabled')).toBe(true)
  })
})