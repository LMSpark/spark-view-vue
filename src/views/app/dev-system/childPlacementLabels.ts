import type { ChildPlacement } from '@spark-appworks/spark-project-model'

type ChildPlacementValue = '' | ChildPlacement

const CHILD_PLACEMENT_LABELS = {
  header: '顶部',
  sidebar: '侧边栏',
  toolbar: '工具栏',
  'user-menu': '用户菜单',
  parent: '继承父级',
  flat: '平铺',
} satisfies Record<ChildPlacement, string>

export const CHILD_PLACEMENT_OPTIONS: ReadonlyArray<{ value: ChildPlacementValue; label: string }> = [
  { value: '', label: '默认' },
  { value: 'header', label: '顶部' },
  { value: 'sidebar', label: '侧边栏' },
  { value: 'toolbar', label: '工具栏' },
  { value: 'user-menu', label: '用户菜单' },
  { value: 'parent', label: '继承父级' },
  { value: 'flat', label: '平铺' },
]

export function formatChildPlacementLabel(value: string | null | undefined): string {
  if (!value) return ''
  if (isChildPlacement(value)) {
    return CHILD_PLACEMENT_LABELS[value]
  }
  return value
}

function isChildPlacement(value: string): value is ChildPlacement {
  return Object.prototype.hasOwnProperty.call(CHILD_PLACEMENT_LABELS, value)
}
