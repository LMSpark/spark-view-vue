let _pageState = { selectedRow: null }

function __init__() {
  const view = $dataSet?.getView('Users', 'default')
  view?.events.on('currentRowChanged', (row) => {
    _pageState.selectedRow = row
    console.log('当前行已变更:', row)
  })
}

function handleAdd() {
  $page.showPrompt('请输入新用户信息', '新增用户').then((value) => {
    if (value) {
      const view = $dataSet?.getView('Users', 'default')
      const newId = Math.max(...view.rows.map(r => r.id)) + 1
      view.appendRow({ id: newId, name: value, age: 0, email: '', status: '在职' })
      $page.showMessage('新增成功', 'success')
    }
  })
}

function handleEdit() {
  if (!_pageState.selectedRow) {
    $page.showMessage('请先选择一行', 'warning')
    return
  }
  $page.showPrompt('请输入新姓名', '编辑用户', _pageState.selectedRow.name).then((value) => {
    if (value) {
      const view = $dataSet?.getView('Users', 'default')
      view.updateRowById(_pageState.selectedRow.id, { name: value })
      $page.showMessage('编辑成功', 'success')
    }
  })
}

function handleDelete() {
  if (!_pageState.selectedRow) {
    $page.showMessage('请先选择一行', 'warning')
    return
  }
  $page.showConfirm('确认删除该用户？').then((ok) => {
    if (ok) {
      const view = $dataSet?.getView('Users', 'default')
      view.deleteRowById(_pageState.selectedRow.id)
      _pageState.selectedRow = null
      $page.showMessage('删除成功', 'success')
    }
  })
}

function handleCurrentChange(row) {
  console.log('当前行变更事件:', row)
  // 框架会自动同步 currentRow，此处只需处理业务逻辑
  _pageState.selectedRow = row
}