import { describe, expect, it } from 'vitest'
import {
  localizeEditorContextMenuItems,
  localizeEditorMenuItems,
} from '../packages/spark-component/src/components/support/jsonEditorLocalization'

type MenuItem = Parameters<typeof localizeEditorMenuItems>[0][number]
type ContextMenuItem = Parameters<typeof localizeEditorContextMenuItems>[0][number]

describe('json editor localization', () => {
  it('localizes top-level menu labels in zh mode', () => {
    const treeButton = { type: 'button', text: 'tree', title: 'Switch to tree mode (current mode: text)', onClick: () => {} } satisfies MenuItem
    const tableButton = { type: 'button', text: 'table', title: 'Switch to table mode (current mode: tree)', onClick: () => {} } satisfies MenuItem
    const formatButton = { type: 'button', text: 'Format', title: 'Format', onClick: () => {} } satisfies MenuItem
    const items: MenuItem[] = [
      treeButton,
      tableButton,
      formatButton,
      { type: 'separator' },
    ]

    expect(localizeEditorMenuItems(items, true)).toEqual([
      { type: 'button', text: '对象', title: '切换到对象模式（当前模式：源码）', onClick: treeButton.onClick },
      { type: 'button', text: '表格', title: '切换到表格模式（当前模式：对象）', onClick: tableButton.onClick },
      { type: 'button', text: '格式化', title: '格式化', onClick: formatButton.onClick },
      { type: 'separator' },
    ])
  })

  it('keeps labels unchanged when localization is disabled', () => {
    const items: MenuItem[] = [
      { type: 'button', text: 'Tree', title: 'Switch to tree mode', onClick: () => {} },
    ]

    expect(localizeEditorMenuItems(items, false)).toBe(items)
  })

  it('localizes nested context menu items', () => {
    const duplicateButton = {
      type: 'button' as const,
      text: 'Duplicate',
      title: 'Duplicate',
      onClick: () => {},
    }
    const dropdownItem = {
      type: 'dropdown-button' as const,
      main: { type: 'button' as const, text: 'Sort', title: 'Sort', onClick: () => {} },
      items: [
        { type: 'button' as const, text: 'ascending', title: 'ascending', onClick: () => {} },
        { type: 'button' as const, text: 'descending', title: 'descending', onClick: () => {} },
      ],
    }
    const items: ContextMenuItem[] = [
      {
        type: 'row',
        items: [
          dropdownItem,
          {
            type: 'column',
            items: [
              { type: 'label', text: 'Search' },
              duplicateButton,
            ],
          },
        ],
      },
    ]

    expect(localizeEditorContextMenuItems(items, true)).toEqual([
      {
        type: 'row',
        items: [
          {
            type: 'dropdown-button',
            main: { type: 'button', text: '排序', title: '排序', onClick: dropdownItem.main.onClick },
            items: [
              { type: 'button', text: '升序', title: '升序', onClick: dropdownItem.items[0]!.onClick },
              { type: 'button', text: '降序', title: '降序', onClick: dropdownItem.items[1]!.onClick },
            ],
          },
          {
            type: 'column',
            items: [
              { type: 'label', text: '搜索' },
              { type: 'button', text: '复制', title: '复制', onClick: duplicateButton.onClick },
            ],
          },
        ],
      },
    ])
  })
})