let _pageState = {
  selectedRows: [],
  currentRow: null
}

function __init__() {
  const view = $dataSet?.getView('Projects', 'default')
  if (view) {
    view.events.on('currentRowChanged', (row) => {
      _pageState.currentRow = row
      updateDeleteButtonState()
    })
    
    view.events.on('rowsChanged', () => {
      updateDeleteButtonState()
    })
  }
  
  updateDeleteButtonState()
}

function handleAdd() {
  $page.showPrompt('请输入新项目名称', '新增项目').then(name => {
    if (!name) return
    
    const view = $dataSet?.getView('Projects', 'default')
    if (!view) return
    
    const newId = Math.max(...view.rows.map(r => r.id), 0) + 1
    const newProject = {
      id: newId,
      name: name,
      status: '规划中',
      manager: '待分配',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      description: ''
    }
    
    view.appendRow(newProject)
    view.setCurrentRow(newProject)
    
    $page.showMessage(`项目“${name}”已添加`, 'success')
  })
}

function handleDelete() {
  if (_pageState.selectedRows.length === 0) {
    $page.showMessage('请先选择要删除的项目', 'warning')
    return
  }
  
  const projectNames = _pageState.selectedRows.map(r => r.name).join('、')
  
  $page.showConfirm(`确定要删除选中的 ${_pageState.selectedRows.length} 个项目吗？\n${projectNames}`, '确认删除').then(confirmed => {
    if (!confirmed) return
    
    const view = $dataSet?.getView('Projects', 'default')
    if (!view) return
    
    const idsToDelete = _pageState.selectedRows.map(r => r.id)
    idsToDelete.forEach(id => {
      view.deleteRowById(id)
    })
    
    _pageState.selectedRows = []
    updateDeleteButtonState()
    
    $page.showMessage(`已删除 ${idsToDelete.length} 个项目`, 'success')
  })
}

function handleCurrentChange(currentRow) {
  _pageState.currentRow = currentRow
  updateDeleteButtonState()
}

function handleSelectionChange(selection) {
  _pageState.selectedRows = selection
  updateDeleteButtonState()
}

function updateDeleteButtonState() {
  const deleteBtn = $api.el('deleteBtn')
  if (deleteBtn) {
    const hasSelection = _pageState.selectedRows && _pageState.selectedRows.length > 0
    deleteBtn.disabled = !hasSelection
  }
}
