import type { ContextMenuItem, MenuItem } from 'vanilla-jsoneditor'

const EDITOR_LABEL_MAP = new Map<string, string>([
  ['Tree', '对象'],
  ['tree', '对象'],
  ['Text', '源码'],
  ['text', '源码'],
  ['Table', '表格'],
  ['table', '表格'],
  ['Undo', '撤销'],
  ['Redo', '重做'],
  ['Format', '格式化'],
  ['Compact', '压缩'],
  ['Sort', '排序'],
  ['Transform', '转换'],
  ['Repair', '修复'],
  ['Search', '搜索'],
  ['Expand all', '全部展开'],
  ['Collapse all', '全部折叠'],
  ['Insert', '插入'],
  ['Append', '追加'],
  ['Duplicate', '复制'],
  ['Remove', '删除'],
  ['Extract', '抽取'],
  ['Cut', '剪切'],
  ['Copy', '复制'],
  ['Paste', '粘贴'],
  ['Filter', '过滤'],
  ['Pick', '选择字段'],
  ['ascending', '升序'],
  ['descending', '降序'],
  ['Switch to tree mode', '切换到对象模式'],
  ['Switch to text mode', '切换到源码模式'],
  ['Switch to table mode', '切换到表格模式'],
])

const MODE_SWITCH_TITLE_REGEX = /^Switch to (text|tree|table) mode \(current mode: (text|tree|table)\)$/

function translateModeName(modeName: string | undefined): string {
  if (!modeName) {
    return ''
  }

  return EDITOR_LABEL_MAP.get(modeName) ?? modeName
}

function translateEditorLabel(text: string | undefined): string | undefined {
  if (!text) return text

  const modeSwitchMatch = MODE_SWITCH_TITLE_REGEX.exec(text)
  if (modeSwitchMatch) {
    const [, targetMode, currentMode] = modeSwitchMatch
    return `切换到${translateModeName(targetMode)}模式（当前模式：${translateModeName(currentMode)}）`
  }

  return EDITOR_LABEL_MAP.get(text) ?? text
}

function localizeMenuButton<T extends { text?: string; title?: string }>(item: T): T {
  return {
    ...item,
    ...(item.text ? { text: translateEditorLabel(item.text) } : {}),
    ...(item.title ? { title: translateEditorLabel(item.title) } : {}),
  }
}

function localizeMenuItem(item: MenuItem): MenuItem {
  if (item.type !== 'button') return item
  return localizeMenuButton(item)
}

function localizeContextMenuItem(item: ContextMenuItem): ContextMenuItem {
  if (item.type === 'button') {
    return localizeMenuButton(item)
  }

  if (item.type === 'dropdown-button') {
    return {
      ...item,
      main: localizeMenuButton(item.main),
      items: item.items.map(localizeMenuButton),
    }
  }

  if (item.type === 'row') {
    return {
      ...item,
      items: item.items.map((entry) => {
        if (entry.type === 'button') {
          return localizeMenuButton(entry)
        }

        if (entry.type === 'dropdown-button') {
          return {
            ...entry,
            main: localizeMenuButton(entry.main),
            items: entry.items.map(localizeMenuButton),
          }
        }

        return {
          ...entry,
          items: entry.items.map((columnItem) => {
            if (columnItem.type === 'button') {
              return localizeMenuButton(columnItem)
            }

            if (columnItem.type === 'dropdown-button') {
              return {
                ...columnItem,
                main: localizeMenuButton(columnItem.main),
                items: columnItem.items.map(localizeMenuButton),
              }
            }

            if (columnItem.type === 'label') {
              return {
                ...columnItem,
                text: translateEditorLabel(columnItem.text) ?? columnItem.text,
              }
            }

            return columnItem
          }),
        }
      }),
    }
  }

  return item
}

export function localizeEditorMenuItems(items: MenuItem[], enabled = true): MenuItem[] {
  if (!enabled) return items
  return items.map(localizeMenuItem)
}

export function localizeEditorContextMenuItems(
  items: ContextMenuItem[],
  enabled = true,
): ContextMenuItem[] {
  if (!enabled) return items
  return items.map(localizeContextMenuItem)
}