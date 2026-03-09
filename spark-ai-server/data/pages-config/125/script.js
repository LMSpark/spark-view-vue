let _pageState = { selectedRow: null }

function __init__() {
  const view = $dataSet?.getView('Users', 'default')
  if (view) {
    view.events.on('currentRowChanged', (row) => {
      _pageState.selectedRow = row
      console.log('当前行已变更:', row)
    })
  }
}

function handleAdd() {
  $page.showMessage('新增功能待实现', 'info')
}

function handleEdit() {
  if (!_pageState.selectedRow) {
    $page.showMessage('请先选择一行进行编辑', 'warning')
    return
  }
  $page.showMessage(`编辑用户: ${_pageState.selectedRow.name}`, 'info')
}

function handleDelete() {
  if (!_pageState.selectedRow) {
    $page.showMessage('请先选择一行进行删除', 'warning')
    return
  }
  $page.showConfirm(`确认删除用户 ${_pageState.selectedRow.name} 吗？`).then((ok) => {
    if (ok) {
      const view = $dataSet?.getView('Users', 'default')
      if (view) {
        view.deleteRowById(_pageState.selectedRow.id)
        $page.showMessage('删除成功', 'success')
        _pageState.selectedRow = null
      }
    }
  })
}

function handleCurrentChange(currentRow) {
  // 框架已通过 bind-table-delegate 自动同步 currentRow，此处仅写业务逻辑
  console.log('表格当前行变更:', currentRow)
}