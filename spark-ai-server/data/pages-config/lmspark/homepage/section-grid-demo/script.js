const SECTION_GRID_ORIGINATOR = 'section-grid-demo'

function getProfilesView() {
  return $dataSet?.getView('profiles', 'default') ?? null
}

function focusProfileByIndex(index) {
  const view = getProfilesView()
  if (!view || !view.rows.length) {
    $page.showMessage('profiles 视图未就绪', 'warning')
    return
  }

  const safeIndex = Math.max(0, Math.min(index, view.rows.length - 1))
  const row = view.rows[safeIndex]
  if (!row) return

  view.selection.setCurrentRowById(row.id, SECTION_GRID_ORIGINATOR)
  $page.showMessage(`已定位到 ${row.name}`, 'success')
}

function __init__() {
  focusProfileByIndex(0)
}

function focusFirstProfile() {
  focusProfileByIndex(0)
}

function focusLastProfile() {
  const view = getProfilesView()
  if (!view || !view.rows.length) {
    $page.showMessage('profiles 视图未就绪', 'warning')
    return
  }
  focusProfileByIndex(view.rows.length - 1)
}

function showGridRules() {
  $page.showAlert(
    '块状容器默认走 24 列、0 水槽布局。section 内子组件用 props.colSpan / rowSpan 控制占位，r-list 外层 item 用 itemColSpan / itemRowSpan 控制卡片排布。',
    '布局说明'
  )
}

function announceCurrentProfile() {
  const view = getProfilesView()
  const currentRow = view?.currentRow ?? null
  if (!currentRow) {
    $page.showMessage('当前还没有选中的成员', 'warning')
    return
  }

  $page.showMessage(`当前成员：${currentRow.name} / ${currentRow.title}`, 'info')
}