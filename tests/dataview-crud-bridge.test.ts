import { describe, it, expect, vi } from 'vitest'
import { SparkData } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import { createBuiltinActionHandler } from '../packages/spark-component/src/components/containers/support/actions/builtin-action-handler'
import { isBuiltinActionDisabled } from '../packages/spark-component/src/components/containers/support/actions/builtin-action-disabled'
import { executeActionDescriptor } from '../packages/spark-component/src/page/actions/action-executor'
import type { ActionExecutionContext } from '../packages/spark-component/src/page/actions/action-descriptor'
import type { IPageServiceCapability } from '@spark-view/spark-component'

function createDataView() {
  const dataSet = SparkData.createDataSet({
    dataSetName: 'CrudBridgeDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: {
            rows: [{ id: 1, name: 'Alice' }],
          },
        },
      },
    },
  })

  const view = dataSet.getView('Users', 'default')
  if (!view) {
    throw new Error('Users@default view not created')
  }
  view.setCurrentRowById(1)
  return { dataSet, view }
}

function createPageService(overrides: Partial<IPageServiceCapability> = {}): IPageServiceCapability {
  return {
    showMessage: vi.fn(),
    showConfirm: vi.fn(async () => true),
    showPrompt: vi.fn(async () => null),
    showAlert: vi.fn(async () => {}),
    showLoading: vi.fn(() => ({ close: vi.fn() })),
    showDialog: vi.fn(async () => ({ action: 'close' })),
    navigate: vi.fn(),
    goBack: vi.fn(),
    selectEntities: vi.fn(async () => ({ selected: [] })),
    browseFile: vi.fn(async () => null),
    uploadFile: vi.fn(async () => null),
    ...overrides,
  } as unknown as IPageServiceCapability
}

function createActionContext(dataSet: ReturnType<typeof createDataView>['dataSet'], pageService: IPageServiceCapability): ActionExecutionContext {
  return {
    getDataSet: () => dataSet,
    getPageService: () => pageService,
    getRouter: () => null,
    callFunc: vi.fn(),
  }
}

async function flushAsync() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('DataView CRUD bridge', () => {
  it('view CRUD should direct-commit to remote when create/update/delete API is configured', async () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'CrudRemoteDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          api: {
            create: { url: '/api/users', method: 'POST' },
            update: { url: '/api/users/{id}', method: 'PUT' },
            delete: { url: '/api/users/{id}', method: 'DELETE' },
          },
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice', status: 'active' }],
            },
          },
        },
      },
    })

    const httpClient = {
      get: vi.fn(),
      post: vi.fn(async () => ({ id: 2, name: 'Bob' })),
      put: vi.fn(async () => ({ id: 1, name: 'Alice-2', status: 'active' })),
      delete: vi.fn(async () => true),
    }
    dataSet.setSharedHttpClient(httpClient as never)

    const view = dataSet.getView('Users', 'default')!
    const appendRowSpy = vi.spyOn(view, 'appendRow')
    const updateRowByIdSpy = vi.spyOn(view, 'updateRowById')
    const deleteRowByIdSpy = vi.spyOn(view, 'deleteRowById')

    const createResult = await view.addRow({ id: 2, name: 'Bob' })
    expect(httpClient.post).toHaveBeenCalledOnce()
    expect(createResult).toMatchObject({ success: true, data: { id: 2, name: 'Bob' } })
    expect(appendRowSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 2, name: 'Bob' }))
    expect(view.rows.map(row => row['id'])).toEqual([1, 2])

    const updateResult = await view.editRowById(1, { name: 'Alice-2' })
    expect(httpClient.put).toHaveBeenCalledOnce()
    expect(httpClient.put).toHaveBeenCalledWith('/api/users/1', { id: 1, name: 'Alice-2', status: 'active' }, expect.anything())
    expect(updateResult).toMatchObject({ success: true, data: { id: 1, name: 'Alice-2', status: 'active' } })
    expect(updateRowByIdSpy).toHaveBeenCalledWith(1, expect.objectContaining({ id: 1, name: 'Alice-2', status: 'active' }))
    expect(view.rows.find(row => row['id'] === 1)?.['name']).toBe('Alice-2')

    const deleteResult = await view.removeRow(2)
    expect(httpClient.delete).toHaveBeenCalledOnce()
    expect(deleteResult).toMatchObject({ success: true, data: true })
    expect(deleteRowByIdSpy).toHaveBeenCalledWith(2)
    expect(view.rows.map(row => row['id'])).toEqual([1])
  })

  it('remote update should unwrap success-node payload and sync local row', async () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'CrudWrappedUpdateDS',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string', isPrimaryKey: true },
            { name: 'title', type: 'string' },
            { name: 'path', type: 'string', allowDBNull: true },
          ],
          api: {
            update: { url: '/api/nodes/{id}', method: 'PUT' },
          },
          views: {
            default: {
              rows: [{ id: 'node-1', title: '旧标题', path: '/old' }],
            },
          },
        },
      },
    })

    const httpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(async () => ({
        success: true,
        node: { id: 'node-1', title: '新标题', path: '/new' },
      })),
      delete: vi.fn(),
      patch: vi.fn(),
    }
    dataSet.setSharedHttpClient(httpClient as never)

    const view = dataSet.getView('Nodes', 'default')!

    const result = await view.editRowById('node-1', { title: '新标题', path: '/new' })

    expect(result).toMatchObject({ success: true, data: { id: 'node-1', title: '新标题', path: '/new' } })
    expect(view.rows.find(row => row['id'] === 'node-1')?.['title']).toBe('新标题')
    expect(view.rows.find(row => row['id'] === 'node-1')?.['path']).toBe('/new')
  })

  it('builtin append-row should call view.addRow instead of appendRow', async () => {
    const { view } = createDataView()
    const pageService = createPageService()
    const addRowSpy = vi.spyOn(view, 'addRow').mockResolvedValue({ id: 2, name: 'Bob' } as IDataRow)
    const appendRowSpy = vi.spyOn(view, 'appendRow')

    const handler = createBuiltinActionHandler({
      getView: () => view,
      getPageService: () => pageService,
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never,
      hasRemoteListApi: () => false,
    })

    const action = {
      type: 'r-button',
      props: {
        action: 'append-row',
        appendPayload: { id: 2, name: 'Bob' },
      },
    }

    handler.handleToolbar(action)
    await flushAsync()

    expect(addRowSpy).toHaveBeenCalledWith({ id: 2, name: 'Bob' })
    expect(appendRowSpy).not.toHaveBeenCalled()
  })

  it('builtin append-row should switch currentRow to created row when configured', async () => {
    const { view } = createDataView()
    const pageService = createPageService()

    const handler = createBuiltinActionHandler({
      getView: () => view,
      getPageService: () => pageService,
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never,
      hasRemoteListApi: () => false,
    })

    handler.handleToolbar({
      type: 'r-button',
      props: {
        action: 'append-row',
        setCurrentRowOnSuccess: true,
        appendPayload: { id: 2, name: 'Bob' },
      },
    })
    await flushAsync()

    expect(view.currentRow?.['id']).toBe(2)
    expect(view.currentRow?.['name']).toBe('Bob')
  })

  it('builtin prompt-edit should call view.editRowById instead of updateRowById', async () => {
    const { view } = createDataView()
    const pageService = createPageService({
      showPrompt: vi.fn(async () => 'Bob'),
    })
    const editRowSpy = vi.spyOn(view, 'editRowById').mockResolvedValue(true)
    const updateRowSpy = vi.spyOn(view, 'updateRowById')

    const handler = createBuiltinActionHandler({
      getView: () => view,
      getPageService: () => pageService,
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never,
      hasRemoteListApi: () => false,
    })

    const action = {
      type: 'r-button',
      props: {
        action: 'prompt-edit',
        field: 'name',
      },
    }

    handler.handleToolbar(action)
    await flushAsync()

    expect(editRowSpy).toHaveBeenCalledWith(1, { name: 'Bob' })
    expect(updateRowSpy).not.toHaveBeenCalled()
  })

  it('builtin submit-current-form should call view.editRowById with current form draft', async () => {
    const { view } = createDataView()
    const pageService = createPageService()
    const editRowSpy = vi.spyOn(view, 'editRowById').mockResolvedValue(true)
    const validateSpy = vi.fn(async () => true)

    const handler = createBuiltinActionHandler({
      getView: () => view,
      getPageService: () => pageService,
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never,
      hasRemoteListApi: () => false,
      getFormApi: () => ({
        getCurrentRow: () => view.currentRow,
        getFormData: () => ({ id: 1, name: 'Alice-2' }),
        validate: validateSpy,
      }),
    })

    handler.handleToolbar({
      type: 'r-button',
      props: {
        action: 'submit-current-form',
      },
    })
    await flushAsync()

    expect(validateSpy).toHaveBeenCalledOnce()
    expect(editRowSpy).toHaveBeenCalledWith(1, { id: 1, name: 'Alice-2' })
  })

  it('builtin prompt-append should build child row from scope row without script handlers', async () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'TreeAppendDS',
      tables: {
        Nodes: {
          tableName: 'Nodes',
          columns: [
            { name: 'id', type: 'string', isPrimaryKey: true },
            { name: 'title', type: 'string' },
            { name: 'parentId', type: 'string' },
            { name: 'nodeKind', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: 'root-1', title: '根节点', parentId: null, nodeKind: 'module' }],
            },
          },
        },
      },
    })

    const view = dataSet.getView('Nodes', 'default')!
    const pageService = createPageService({
      showPrompt: vi.fn(async () => '子节点 A'),
    })
    const addRowSpy = vi.spyOn(view, 'addRow').mockResolvedValue({
      success: true,
      data: { id: 'child-a', title: '子节点 A', parentId: 'root-1', nodeKind: 'page' },
    })

    const handler = createBuiltinActionHandler({
      getView: () => view,
      getPageService: () => pageService,
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never,
      hasRemoteListApi: () => false,
    })

    handler.handleRow({
      type: 'r-button',
      props: {
        action: 'prompt-append',
        field: 'title',
        inheritFieldMap: { parentId: 'id' },
        appendPayload: { nodeKind: 'page' },
      },
    }, view.rows[0]!, 0)
    await flushAsync()

    expect(addRowSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: '子节点 A',
      parentId: 'root-1',
      nodeKind: 'page',
    }))
  })

  it('builtin clear-rows should replace current view rows with empty list', async () => {
    const { view } = createDataView()
    const pageService = createPageService({
      showConfirm: vi.fn(async () => true),
    })

    view.selection.setSelectedRows([view.rows[0]!])

    expect(view.rows).toHaveLength(1)

    const handler = createBuiltinActionHandler({
      getView: () => view,
      getPageService: () => pageService,
      getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never,
      hasRemoteListApi: () => false,
    })

    handler.handleToolbar({
      type: 'r-button',
      props: {
        action: 'clear-rows',
      },
    })
    await flushAsync()

    expect(view.rows).toHaveLength(0)
    expect(view.currentRow).toBeNull()
    expect(view.selectedRows).toHaveLength(0)
    expect(pageService.showConfirm).toHaveBeenCalledOnce()
  })

  it('builtin disabledWhenRow should disable action for matching current row', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'BuiltinDisableDS',
      tables: {
        NavigationNodes: {
          tableName: 'NavigationNodes',
          columns: [
            { name: 'id', type: 'string', isPrimaryKey: true },
            { name: 'nodeKind', type: 'string' },
            { name: 'parentId', type: 'string' },
          ],
          views: {
            default: {
              rows: [{ id: '__toolbar__', nodeKind: 'system-directory', parentId: null }],
            },
          },
        },
      },
    })

    const view = dataSet.getView('NavigationNodes', 'default')!
    view.setCurrentRowById('__toolbar__')

    expect(isBuiltinActionDisabled({
      type: 'r-button',
      props: {
        action: 'submit-current-form',
        disabledWhenRow: {
          nodeKind: 'system-directory',
          parentId: null,
        },
      },
    }, view)).toBe(true)
  })

  it('action executor append-row should call view.addRow instead of appendRow', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService()
    const addRowSpy = vi.spyOn(view, 'addRow').mockResolvedValue({ id: 2, name: 'Bob' } as IDataRow)
    const appendRowSpy = vi.spyOn(view, 'appendRow')

    await executeActionDescriptor(
      {
        action: 'append-row',
        dataKey: 'Users@rows',
        payload: { id: 2, name: 'Bob' },
      },
      createActionContext(dataSet, pageService),
    )

    expect(addRowSpy).toHaveBeenCalledWith({ id: 2, name: 'Bob' })
    expect(appendRowSpy).not.toHaveBeenCalled()
  })

  it('action executor delete-current should call view.removeRow instead of deleteRowById', async () => {
    const { dataSet, view } = createDataView()
    const pageService = createPageService({
      showConfirm: vi.fn(async () => true),
    })
    const removeRowSpy = vi.spyOn(view, 'removeRow').mockResolvedValue(true)
    const deleteRowSpy = vi.spyOn(view, 'deleteRowById')

    await executeActionDescriptor(
      {
        action: 'delete-current',
        dataKey: 'Users@rows',
        confirmMessage: '确认删除？',
      },
      createActionContext(dataSet, pageService),
    )

    expect(removeRowSpy).toHaveBeenCalledWith(1)
    expect(deleteRowSpy).not.toHaveBeenCalled()
  })
})