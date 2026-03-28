import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { FieldText, FieldCheckbox, FieldSlider, FieldRate, FieldColor } from '@spark-view/spark-component'
import { mountFieldInContext } from './helpers/mount-field-in-context'

const ElFormItemStub = defineComponent({
  props: ['label', 'prop', 'rules'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
  },
})

const ElInputStub = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-input-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-disabled': String(Boolean(props.disabled)),
    })
  },
})

const ElCheckboxStub = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-checkbox-stub',
      'data-value': String(Boolean(props.modelValue)),
      'data-disabled': String(Boolean(props.disabled)),
    }, slots['default']?.())
  },
})

const ElSliderStub = defineComponent({
  props: ['modelValue', 'min', 'max', 'step', 'disabled', 'showInput'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-slider-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-min': String(props.min ?? ''),
      'data-max': String(props.max ?? ''),
    })
  },
})

const ElRateStub = defineComponent({
  props: ['modelValue', 'max', 'allowHalf', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-rate-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-max': String(props.max ?? ''),
    })
  },
})

const ElColorPickerStub = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-color-picker-stub',
      'data-value': String(props.modelValue ?? ''),
      'data-disabled': String(Boolean(props.disabled)),
    })
  },
})

function mountBasicField(
  component: object,
  type: 'r-text' | 'r-checkbox' | 'r-slider' | 'r-rate' | 'r-color',
  model: Record<string, unknown>,
  fieldName: string,
  componentProps?: Record<string, unknown>,
) {
  return mountFieldInContext({
    component,
    type,
    model,
    fieldName,
    componentProps,
    global: {
      stubs: {
        'el-form-item': ElFormItemStub,
        'el-input': ElInputStub,
        'el-checkbox': ElCheckboxStub,
        'el-slider': ElSliderStub,
        'el-rate': ElRateStub,
        'el-color-picker': ElColorPickerStub,
        'el-table-column': defineComponent({
          setup() { return () => h('div', { class: 'el-table-column-stub' }) },
        }),
      },
    },
  })
}

describe('基础值字段组件', () => {
  it('FieldText 应继续将输入值写回 contextData', async () => {
    const model = reactive<Record<string, unknown>>({ name: '' })
    const wrapper = mountBasicField(FieldText, 'r-text', model, 'name')

    const input = wrapper.findComponent(ElInputStub)
    input.vm.$emit('update:modelValue', 'Alice')
    await nextTick()

    expect(model['name']).toBe('Alice')
    expect(wrapper.find('.el-input-stub').attributes('data-value')).toBe('Alice')
  })

  it('FieldCheckbox 应继续同步布尔值', async () => {
    const model = reactive<Record<string, unknown>>({ agreed: false })
    const wrapper = mountBasicField(FieldCheckbox, 'r-checkbox', model, 'agreed', {
      checkboxText: '同意协议',
    })

    const checkbox = wrapper.findComponent(ElCheckboxStub)
    checkbox.vm.$emit('update:modelValue', true)
    await nextTick()

    expect(model['agreed']).toBe(true)
    expect(wrapper.find('.el-checkbox-stub').text()).toContain('同意协议')
  })

  it('FieldSlider 应继续同步数字值', async () => {
    const model = reactive<Record<string, unknown>>({ score: 10 })
    const wrapper = mountBasicField(FieldSlider, 'r-slider', model, 'score', {
      min: 0,
      max: 100,
      step: 5,
    })

    const slider = wrapper.findComponent(ElSliderStub)
    slider.vm.$emit('update:modelValue', 25)
    await nextTick()

    expect(model['score']).toBe(25)
    expect(wrapper.find('.el-slider-stub').attributes('data-value')).toBe('25')
  })

  it('FieldRate 应继续同步评分值', async () => {
    const model = reactive<Record<string, unknown>>({ rating: 2 })
    const wrapper = mountBasicField(FieldRate, 'r-rate', model, 'rating', {
      max: 5,
      allowHalf: true,
    })

    const rate = wrapper.findComponent(ElRateStub)
    rate.vm.$emit('update:modelValue', 4)
    await nextTick()

    expect(model['rating']).toBe(4)
    expect(wrapper.find('.el-rate-stub').attributes('data-value')).toBe('4')
  })

  it('FieldColor 应继续将 null 归一为空字符串', async () => {
    const model = reactive<Record<string, unknown>>({ color: '#409eff' })
    const wrapper = mountBasicField(FieldColor, 'r-color', model, 'color')

    const colorPicker = wrapper.findComponent(ElColorPickerStub)
    colorPicker.vm.$emit('update:modelValue', null)
    await nextTick()

    expect(model['color']).toBe('')
    expect(wrapper.find('.el-color-picker-stub').attributes('data-value')).toBe('')
  })
})