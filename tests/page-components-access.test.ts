import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { buildPageContext } from '../packages/spark-component/src/page/buildPageContext'
import { createPageComponentRegistry } from '../packages/spark-component/src/page/page-component-registry'
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
})
