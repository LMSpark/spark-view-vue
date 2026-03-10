import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { Spark, SPARK_PARENT_CONTEXT_KEY, SPARK_REGISTRY_KEY, useSparkComponent } from '@spark-view/spark-component'
import { CONTEXT_DATA, FIELD_CONTEXT } from '../src/components/capability-keys'
import FieldTextarea from '../src/components/renderer-fields/FieldTextarea.vue'
import FieldHtmlEditor from '../src/components/renderer-fields/FieldHtmlEditor.vue'
import FieldFileBrowser from '../src/components/renderer-fields/FieldFileBrowser.vue'

const { registry, rootContext } = Spark.createSystem()

function mountWithFieldContext(component: object, model: Record<string, unknown>) {
  const Provider = defineComponent({
    setup() {
      const { provide } = useSparkComponent({ type: 'test-provider' })
      provide(FIELD_CONTEXT, 'form')
      provide(CONTEXT_DATA, model)
      return () => h(component as never, { config: { type: 'test-field', name: 'content' } })
    },
  })

  return mount(Provider, {
    global: {
      provide: {
        [SPARK_REGISTRY_KEY as symbol]: registry,
        [SPARK_PARENT_CONTEXT_KEY as symbol]: rootContext,
      },
      stubs: {
        'el-table-column': defineComponent({
          setup() {
            return () => h('div', { class: 'el-table-column-stub' })
          },
        }),
        'el-form-item': defineComponent({
          setup(_, { slots }) {
            return () => h('div', { class: 'el-form-item-stub' }, slots['default']?.())
          },
        }),
        'el-input': defineComponent({
          props: ['modelValue', 'type'],
          emits: ['update:modelValue'],
          setup(props, { emit }) {
            return () => h(props.type === 'textarea' ? 'textarea' : 'input', {
              class: 'el-input-stub',
              value: props.modelValue,
              onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
            })
          },
        }),
        'el-input-number': defineComponent({
          props: ['modelValue'],
          emits: ['update:modelValue'],
          setup(props, { emit }) {
            return () => h('input', {
              class: 'el-input-number-stub',
              type: 'number',
              value: props.modelValue,
              onInput: (event: Event) => emit('update:modelValue', Number((event.target as HTMLInputElement).value)),
            })
          },
        }),
        'el-button': defineComponent({
          emits: ['click'],
          setup(_, { emit, slots }) {
            return () => h('button', { class: 'el-button-stub', onClick: () => emit('click') }, slots['default']?.())
          },
        }),
      },
    },
  })
}

describe('advanced renderer fields', () => {
  it('textarea should sync multiline value into context data', async () => {
    const model = reactive<Record<string, unknown>>({ content: 'line1' })
    const wrapper = mountWithFieldContext(FieldTextarea, model)

    await wrapper.find('textarea').setValue('line1\nline2')
    expect(model['content']).toBe('line1\nline2')
  })

  it('html editor should sync source html into context data', async () => {
    const model = reactive<Record<string, unknown>>({ content: '<p>old</p>' })
    const wrapper = mountWithFieldContext(FieldHtmlEditor, model)

    await wrapper.find('.toggle-source').trigger('click')
    await wrapper.find('textarea').setValue('<p><strong>new</strong></p>')
    expect(model['content']).toBe('<p><strong>new</strong></p>')
  })

  it('file browser should sync selected file names into context data', async () => {
    const model = reactive<Record<string, unknown>>({ content: '' })
    const wrapper = mountWithFieldContext(FieldFileBrowser, model)

    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['a'], 'alpha.txt'), new File(['b'], 'beta.txt')],
      configurable: true,
    })
    await input.trigger('change')

    expect(model['content']).toBe('alpha.txt, beta.txt')
  })
})