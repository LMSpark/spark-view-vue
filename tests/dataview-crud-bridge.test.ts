import { describe, it, expect, vi } from 'vitest'
import { SparkData } from '@spark-view/spark-data'
import type { IDataRow } from '@spark-view/spark-data'
import { createBuiltinActionHandler } from '../packages/spark-component/src/components/containers/builtin-actions'
import { executeActionDescriptor } from '../packages/spark-component/src/page/actions/action-executor'
import type { ActionExecutionContext } from '../packages/spark-component/src/page/actions/action-descriptor'
import type { IPageServiceCapability } from '@spark-view/spark-utils'

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
        rows: [{ id: 1, name: 'Alice' }],
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
      type: 'builtin-action',
      props: {
        builtinAction: 'append-row',
        appendPayload: { id: 2, name: 'Bob' },
      },
    }

    handler.handleToolbar(action)
    await flushAsync()

    expect(addRowSpy).toHaveBeenCalledWith({ id: 2, name: 'Bob' })
    expect(appendRowSpy).not.toHaveBeenCalled()
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
      type: 'builtin-action',
      props: {
        builtinAction: 'prompt-edit',
        field: 'name',
      },
    }

    handler.handleToolbar(action)
    await flushAsync()

    expect(editRowSpy).toHaveBeenCalledWith(1, { name: 'Bob' })
    expect(updateRowSpy).not.toHaveBeenCalled()
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