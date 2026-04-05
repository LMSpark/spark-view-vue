import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { usePageDataEditorMode } from '../src/views/app/dev-system/composables/usePageDataEditorMode'

function createWrappedPageDataText(tableName = 'Users'): string {
  return JSON.stringify({
    dataset: {
      dataSetName: 'DemoDataSet',
      tables: {
        [tableName]: {
          tableName,
          columns: [
            { name: 'id', type: 'number', label: 'ID' },
          ],
          views: {
            default: {
              rows: [{ id: 1 }],
            },
          },
        },
      },
      tableRelations: [],
      viewDependencies: [],
    },
  })
}

describe('usePageDataEditorMode', () => {
  it('should recover structured mode after pagedata loads from empty text', async () => {
    const rawText = ref('')
    const controller = usePageDataEditorMode({
      getRawText: () => rawText.value,
      applyCanonicalText: (text) => {
        rawText.value = text
      },
    })

    expect(controller.pageDataEditorMode.value).toBe('text')
    expect(controller.pageDataObjectEditorAvailable.value).toBe(false)

    rawText.value = createWrappedPageDataText()
    await nextTick()

    expect(controller.pageDataObjectEditorAvailable.value).toBe(true)
    expect(controller.pageDataEditorMode.value).toBe('tree')
  })

  it('should keep manual source mode when validity toggles', async () => {
    const rawText = ref(createWrappedPageDataText())
    const controller = usePageDataEditorMode({
      getRawText: () => rawText.value,
      applyCanonicalText: (text) => {
        rawText.value = text
      },
    })

    await nextTick()
    controller.handlePageDataEditorModeChange('text')

    rawText.value = '{'
    await nextTick()
    rawText.value = createWrappedPageDataText('Orders')
    await nextTick()

    expect(controller.pageDataObjectEditorAvailable.value).toBe(true)
    expect(controller.pageDataEditorMode.value).toBe('text')
  })

  it('should restore the previous structured mode after auto fallback', async () => {
    const rawText = ref(createWrappedPageDataText())
    const controller = usePageDataEditorMode({
      getRawText: () => rawText.value,
      applyCanonicalText: (text) => {
        rawText.value = text
      },
    })

    await nextTick()
    controller.handlePageDataEditorModeChange('table')
    expect(controller.pageDataEditorMode.value).toBe('table')

    rawText.value = ''
    await nextTick()
    expect(controller.pageDataEditorMode.value).toBe('text')

    rawText.value = createWrappedPageDataText('Projects')
    await nextTick()

    expect(controller.pageDataObjectEditorAvailable.value).toBe(true)
    expect(controller.pageDataEditorMode.value).toBe('table')
  })
})