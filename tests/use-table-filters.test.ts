import { computed, effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { CrudApi, FilterExpression, IDataRow, TableResourceType } from '@spark-view/spark-data'
import { useTableFilters } from '../packages/spark-component/src/components/containers/layout/useTableFilters'

interface FilterViewLike {
  rows: IDataRow[]
  filterExpression?: FilterExpression
  setFilter?: (expr: FilterExpression | undefined) => Promise<void>
  refresh?: () => Promise<void>
  dataTable?: {
    api?: CrudApi
    resourceType?: TableResourceType
  }
}

function createView(options?: {
  rows?: IDataRow[]
  filterExpression?: FilterExpression
  api?: CrudApi
  resourceType?: TableResourceType
}) {
  const setFilter = vi.fn<(expr: FilterExpression | undefined) => Promise<void>>().mockResolvedValue()
  const refresh = vi.fn<() => Promise<void>>().mockResolvedValue()
  const view: FilterViewLike = {
    rows: options?.rows ?? [],
    ...(options?.filterExpression !== undefined ? { filterExpression: options.filterExpression } : {}),
    setFilter,
    refresh,
    dataTable: {
      ...(options?.api !== undefined ? { api: options.api } : {}),
      ...(options?.resourceType !== undefined ? { resourceType: options.resourceType } : {}),
    },
  }
  return { view, setFilter, refresh }
}

async function mountTableFilters(view: FilterViewLike, filterChildren: Array<Record<string, unknown>>) {
  const scope = effectScope()
  const logger = {
    error: vi.fn<(message: string, error?: unknown) => void>(),
  }
  const viewRef = ref(view)
  let api!: ReturnType<typeof useTableFilters>

  scope.run(() => {
    api = useTableFilters({
      filterChildren: computed(() => filterChildren as any),
      dataView: computed(() => viewRef.value as any),
      filterClass: computed(() => undefined),
      filterGridColumns: computed(() => undefined),
      filterGridGap: computed(() => undefined),
      filterGridAutoRows: computed(() => undefined),
      logger,
    })
  })

  await nextTick()
  await Promise.resolve()

  return {
    scope,
    logger,
    api,
  }
}

describe('useTableFilters', () => {
  it('无筛选配置时不会覆盖视图自带 filterExpression', async () => {
    const { view, setFilter, refresh } = createView({
      rows: [{ id: 1, status: '草稿' }],
      filterExpression: {
        field: 'status',
        op: '==',
        value: '草稿',
      },
      api: {
        list: {
          url: '/voucher/list',
          method: 'GET',
        },
      },
      resourceType: 'database-table',
    })

    const { scope } = await mountTableFilters(view, [])

    expect(setFilter).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    scope.stop()
  })

  it('static-data 视图同步 filterExpression 到 DataView，但不触发 refresh', async () => {
    const { view, setFilter, refresh } = createView({
      rows: [
        { id: 1, status: '草稿', summary: '待处理' },
        { id: 2, status: '已审核', summary: '已完成' },
      ],
      resourceType: 'static-data',
      api: {
        list: {
          url: '/voucher/list',
          method: 'GET',
        },
      },
    })

    const filterChildren = [
      {
        type: 'r-select',
        props: {
          field: 'status',
          filterOperator: '==',
        },
        children: [],
      },
    ]

    const { scope, api } = await mountTableFilters(view, filterChildren)
    api.filterModel['status'] = '草稿'

    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenCalledWith({
      field: 'status',
      op: '==',
      value: '草稿',
    })
    expect(refresh).not.toHaveBeenCalled()
    scope.stop()
  })

  it('远程 list 视图在有筛选配置时仍同步到 DataView', async () => {
    const { view, setFilter, refresh } = createView({
      rows: [{ id: 1, status: '草稿' }],
      api: {
        list: {
          url: '/voucher/list',
          method: 'GET',
        },
      },
      resourceType: 'database-table',
    })

    const filterChildren = [
      {
        type: 'r-select',
        props: {
          field: 'status',
          filterOperator: '==',
        },
        children: [],
      },
    ]

    const { scope, api } = await mountTableFilters(view, filterChildren)
    api.filterModel['status'] = '草稿'

    await nextTick()
    await Promise.resolve()

    expect(setFilter).toHaveBeenCalledWith({
      field: 'status',
      op: '==',
      value: '草稿',
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})