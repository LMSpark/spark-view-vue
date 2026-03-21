import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { PAGE_SERVICE, type IPageServiceCapability } from '@spark-view/spark-utils'
import {
  Spark, SPARK_PARENT_CONTEXT_KEY, SPARK_REGISTRY_KEY, useSparkComponent,
  CONTEXT_DATA, FIELD_CONTEXT,
  FieldTextarea, FieldHtmlEditor, FieldFileBrowser, FieldUpload,
  FieldFilePath, FieldImage, FieldEntityPicker, FieldUserPicker,
  FieldDeptPicker, FieldProductPicker,
} from '@spark-view/spark-component'

const { registry, rootContext } = Spark.createSystem()

function createPageService(overrides?: Partial<IPageServiceCapability>): IPageServiceCapability {
  return {
    showMessage: () => {},
    showConfirm: async () => false,
    showPrompt: async () => null,
    showAlert: async () => {},
    showDialog: async () => 'close',
    selectEntities: async () => [],
    browseFiles: async () => [],
    uploadFiles: async () => [],
    showLoading: () => {},
    navigate: () => {},
    ...overrides,
  }
}

function mountWithFieldContext(
  component: object,
  model: Record<string, unknown>,
  pageService?: IPageServiceCapability,
  componentProps?: Record<string, unknown>
) {
  const Provider = defineComponent({
    setup() {
      const { provide } = useSparkComponent({ type: 'test-provider' })
      provide(FIELD_CONTEXT, 'form')
      provide(CONTEXT_DATA, model)
      if (pageService) {
        provide(PAGE_SERVICE, pageService)
      }
      return () => h(component as never, { config: { type: 'test-field', field: 'content' }, ...componentProps })
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
          props: ['disabled'],
          emits: ['click'],
          setup(props, { attrs, emit, slots }) {
            return () => h('button', {
              class: ['el-button-stub', attrs['class']],
              disabled: props.disabled,
              onClick: () => {
                if (props.disabled) return
                emit('click')
              },
            }, slots['default']?.())
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
    const wrapper = mountWithFieldContext(FieldFileBrowser, model, createPageService({
      browseFiles: async () => [
        { name: 'alpha.txt', size: 1, type: 'text/plain', lastModified: 1, file: new File(['a'], 'alpha.txt') },
        { name: 'beta.txt', size: 1, type: 'text/plain', lastModified: 2, file: new File(['b'], 'beta.txt') },
      ],
    }))

    await wrapper.find('.el-button-stub').trigger('click')

    expect(model['content']).toBe('alpha.txt, beta.txt')
  })

  it('file browser should keep browse action when field is readonly', async () => {
    const model = reactive<Record<string, unknown>>({
      content: 'locked.txt',
      _perm: { editableFields: [] },
    })
    let browseCalls = 0
    const wrapper = mountWithFieldContext(FieldFileBrowser, model, createPageService({
      browseFiles: async () => {
        browseCalls += 1
        return [
          { name: 'next.txt', size: 1, type: 'text/plain', lastModified: 1, file: new File(['n'], 'next.txt') },
        ]
      },
    }))

    await wrapper.find('.browse-action-button').trigger('click')

    expect(browseCalls).toBe(1)
    expect(model['content']).toBe('locked.txt')
  })

  it('upload field should upload when editable and switch to browse when readonly', async () => {
    const editableModel = reactive<Record<string, unknown>>({ content: '' })
    let uploadCalls = 0
    let browseCalls = 0
    const pageService = createPageService({
      browseFiles: async () => {
        browseCalls += 1
        return [
          { name: 'locked.pdf', size: 1, type: 'application/pdf', lastModified: 1, file: new File(['l'], 'locked.pdf') },
        ]
      },
      uploadFiles: async () => {
        uploadCalls += 1
        return [
          {
            name: 'report.pdf',
            size: 1,
            type: 'application/pdf',
            lastModified: 1,
            file: new File(['r'], 'report.pdf'),
            response: { url: '/files/report.pdf' },
            url: '/files/report.pdf',
          },
        ]
      },
    })

    const editableWrapper = mountWithFieldContext(FieldUpload, editableModel, pageService, { action: '/api/upload' })
    expect(editableWrapper.find('.primary-action-button').text()).toBe('点击上传')
    await editableWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(0)
    expect(editableModel['content']).toBe('/files/report.pdf')

    const readonlyModel = reactive<Record<string, unknown>>({
      content: '/files/existing.pdf',
      _perm: { editableFields: [] },
    })
    const readonlyWrapper = mountWithFieldContext(FieldUpload, readonlyModel, pageService, { action: '/api/upload' })
    expect(readonlyWrapper.find('.primary-action-button').text()).toBe('浏览')
    await readonlyWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(1)
    expect(readonlyModel['content']).toBe('/files/existing.pdf')
  })

  it('file path field should upload when editable and browse when readonly', async () => {
    let uploadCalls = 0
    let browseCalls = 0
    const pageService = createPageService({
      browseFiles: async () => {
        browseCalls += 1
        return [
          { name: 'picked.txt', size: 1, type: 'text/plain', lastModified: 1, file: new File(['p'], 'picked.txt') },
        ]
      },
      uploadFiles: async () => {
        uploadCalls += 1
        return [
          {
            name: 'uploaded.txt',
            size: 1,
            type: 'text/plain',
            lastModified: 1,
            file: new File(['u'], 'uploaded.txt'),
            response: { url: '/files/uploaded.txt' },
            url: '/files/uploaded.txt',
          },
        ]
      },
    })

    const editableModel = reactive<Record<string, unknown>>({ content: '' })
    const editableWrapper = mountWithFieldContext(FieldFilePath, editableModel, pageService, { action: '/api/upload' })
    expect(editableWrapper.find('.primary-action-button').text()).toBe('上传')
    await editableWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(0)
    expect(editableModel['content']).toBe('/files/uploaded.txt')

    const readonlyModel = reactive<Record<string, unknown>>({
      content: '/files/existing.txt',
      _perm: { editableFields: [] },
    })
    const readonlyWrapper = mountWithFieldContext(FieldFilePath, readonlyModel, pageService, { action: '/api/upload' })
    expect(readonlyWrapper.find('.primary-action-button').text()).toBe('浏览')
    await readonlyWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(1)
    expect(readonlyModel['content']).toBe('/files/existing.txt')
  })

  it('image field should keep preview and follow upload or browse action by editability', async () => {
    let uploadCalls = 0
    let browseCalls = 0
    const pageService = createPageService({
      browseFiles: async () => {
        browseCalls += 1
        return [
          { name: 'image.png', size: 1, type: 'image/png', lastModified: 1, file: new File(['i'], 'image.png') },
        ]
      },
      uploadFiles: async () => {
        uploadCalls += 1
        return [
          {
            name: 'preview.png',
            size: 1,
            type: 'image/png',
            lastModified: 1,
            file: new File(['p'], 'preview.png'),
            response: { url: '/img/preview.png' },
            url: '/img/preview.png',
          },
        ]
      },
    })

    const editableModel = reactive<Record<string, unknown>>({ content: '' })
    const editableWrapper = mountWithFieldContext(FieldImage, editableModel, pageService, { action: '/api/upload-image' })
    await editableWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(editableModel['content']).toBe('/img/preview.png')

    const readonlyModel = reactive<Record<string, unknown>>({
      content: '/img/existing.png',
      _perm: { editableFields: [] },
    })
    const readonlyWrapper = mountWithFieldContext(FieldImage, readonlyModel, pageService, { action: '/api/upload-image' })
    expect(readonlyWrapper.find('.image-preview').exists()).toBe(true)
    expect(readonlyWrapper.find('.primary-action-button').text()).toBe('浏览')
    await readonlyWrapper.find('.primary-action-button').trigger('click')
    expect(uploadCalls).toBe(1)
    expect(browseCalls).toBe(1)
    expect(readonlyModel['content']).toBe('/img/existing.png')
  })

  it('file path field should remain hidden when permission marks field hidden', () => {
    const hiddenModel = reactive<Record<string, unknown>>({
      content: '/files/secret.txt',
      _perm: { hiddenFields: ['content'] },
    })

    const wrapper = mountWithFieldContext(FieldFilePath, hiddenModel, createPageService())

    expect(wrapper.find('.el-form-item-stub').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('/files/secret.txt')
  })

  it('image field should allow masked preview when backend returns mosaicked image', () => {
    const maskedModel = reactive<Record<string, unknown>>({
      content: '/img/mosaic-secret.png',
      _perm: { maskedFields: ['content'] },
    })

    const wrapper = mountWithFieldContext(FieldImage, maskedModel, createPageService())

    expect(wrapper.find('.image-preview').exists()).toBe(true)
    expect(wrapper.find('.image-preview').attributes('src')).toBe('/img/mosaic-secret.png')
    expect((wrapper.find('input').element as HTMLInputElement).value).toContain('***')
  })

  it('entity picker should sync selected entity values into context data', async () => {
    const model = reactive<Record<string, unknown>>({ content: '' })
    const wrapper = mountWithFieldContext(FieldEntityPicker, model, createPageService({
      selectEntities: async () => [
        { label: '张三', value: 'user-1' },
      ],
    }), {
      options: [
        { label: '张三', value: 'user-1' },
        { label: '李四', value: 'user-2' },
      ],
      entityName: '人员',
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('选择')
    await wrapper.find('.primary-action-button').trigger('click')

    expect(model['content']).toBe('user-1')
  })

  it('entity picker should still open selector in readonly mode without mutating value', async () => {
    const model = reactive<Record<string, unknown>>({
      content: 'dept-1',
      _perm: { editableFields: [] },
    })
    let selectorCalls = 0
    const wrapper = mountWithFieldContext(FieldEntityPicker, model, createPageService({
      selectEntities: async () => {
        selectorCalls += 1
        return [{ label: '研发部', value: 'dept-2' }]
      },
    }), {
      options: [
        { label: '市场部', value: 'dept-1' },
        { label: '研发部', value: 'dept-2' },
      ],
      entityName: '部门',
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('查看')
    await wrapper.find('.primary-action-button').trigger('click')

    expect(selectorCalls).toBe(1)
    expect(model['content']).toBe('dept-1')
  })

  it('user picker should use people-specific defaults and sync selected value', async () => {
    const model = reactive<Record<string, unknown>>({ content: '' })
    const wrapper = mountWithFieldContext(FieldUserPicker, model, createPageService({
      selectEntities: async () => [{ label: '张三', value: 'user-1' }],
    }), {
      options: [{ label: '张三', value: 'user-1' }],
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('选人')
    await wrapper.find('.primary-action-button').trigger('click')
    expect(model['content']).toBe('user-1')
  })

  it('dept picker should use department-specific readonly action text', async () => {
    const model = reactive<Record<string, unknown>>({
      content: 'dept-1',
      _perm: { editableFields: [] },
    })
    const wrapper = mountWithFieldContext(FieldDeptPicker, model, createPageService({
      selectEntities: async () => [{ label: '研发部', value: 'dept-2' }],
    }), {
      options: [{ label: '研发部', value: 'dept-2' }],
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('查看部门')
    await wrapper.find('.primary-action-button').trigger('click')
    expect(model['content']).toBe('dept-1')
  })

  it('product picker should support multi-select array mode', async () => {
    const model = reactive<Record<string, unknown>>({ content: [] as string[] })
    const wrapper = mountWithFieldContext(FieldProductPicker, model, createPageService({
      selectEntities: async () => [
        { label: '商品A', value: 'sku-1' },
        { label: '商品B', value: 'sku-2' },
      ],
    }), {
      options: [
        { label: '商品A', value: 'sku-1' },
        { label: '商品B', value: 'sku-2' },
      ],
      multiple: true,
      valueMode: 'array',
    })

    expect(wrapper.find('.primary-action-button').text()).toBe('选商品')
    await wrapper.find('.primary-action-button').trigger('click')
    expect(model['content']).toEqual(['sku-1', 'sku-2'])
  })
})