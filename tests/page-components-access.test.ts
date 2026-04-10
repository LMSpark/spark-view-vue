import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { buildPageContext } from '../packages/spark-component/src/page/context/buildPageContext'
import { compileFunctions } from '../packages/spark-component/src/page/createSandbox'
import { createPageComponentRegistry } from '../packages/spark-component/src/page/context/page-component-registry'
import type { IPageServiceCapability } from '@spark-view/spark-utils'

const mockPageService = {
  showDialog: vi.fn(async () => 'close'),
  selectEntities: vi.fn(async () => []),
  browseFiles: vi.fn(async () => []),
  uploadFiles: vi.fn(async () => []),
  showMessage: vi.fn(),
  showConfirm: vi.fn(async () => true),
  showPrompt: vi.fn(async () => null),
  showAlert: vi.fn(async () => {}),
  showLoading: vi.fn(),
  navigate: vi.fn(),
}

describe('PageContext $components (ID-first)', () => {
  it('should resolve component instance and api by id', () => {
    const registry = createPageComponentRegistry()
    registry.registerInstance({ id: 'orders-table', type: 'r-table' })
    registry.registerApi({
      id: 'orders-table',
      type: 'r-table',
      api: {
        refresh: () => 'ok',
      },
    })

    const context = buildPageContext({
      getDataSet: () => null,
      getComponentRegistry: () => registry,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService as unknown as IPageServiceCapability,
    })

    const instance = context.$components.get('orders-table')
    expect(instance?.id).toBe('orders-table')
    expect(instance?.type).toBe('r-table')

    const api = context.$components.getApi<{ refresh: () => string }>('orders-table')
    expect(api?.refresh()).toBe('ok')

    expect(context.$components.list('r-table')).toHaveLength(1)
    expect(context.$components.getApis<{ refresh: () => string }>('r-table')).toHaveLength(1)

    // 兼容别名
    expect(context.$components.getInstance('orders-table')?.id).toBe('orders-table')
    expect(context.$components.listInstances('r-table')).toHaveLength(1)
  })

  it('should expose permission helpers to page scripts', () => {
    const context = buildPageContext({
      getDataSet: () => null,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService as unknown as IPageServiceCapability,
    })

    expect(context.permission.isPermittedAction('create', {
      modelPermission: { allowCreate: true },
    })).toBe(true)

    const state = context.permission.resolveFieldPermissionState('name', {
      id: 1,
      name: 'Alice',
      _perm: { editableFields: ['name'] },
    })
    expect(state?.editable).toBe(true)
  })

  it('should allow compiled scripts to call injected permission helpers', () => {
    const context = buildPageContext({
      getDataSet: () => null,
      pageRoute: { path: '/', fullPath: '/', params: {}, query: {}, name: '', hash: '' },
      pageContainer: ref<HTMLElement | null>(null),
      pageService: mockPageService as unknown as IPageServiceCapability,
    })

    const fns = compileFunctions(`
      function canCreate() {
        return permission.isPermittedAction('create', {
          modelPermission: { allowCreate: true }
        })
      }

      function canEditField() {
        var state = permission.resolveFieldPermissionState('name', {
          id: 1,
          name: 'Alice',
          _perm: { editableFields: ['name'] }
        })
        return state ? state.editable : false
      }
    `, context)

    expect(fns['canCreate']!()).toBe(true)
    expect(fns['canEditField']!()).toBe(true)
  })
})
