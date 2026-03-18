let _pageState = {
  selectedRows: [],
  searchKeyword: '',
  originalRows: null
}

function __init__() {
  const view = $dataSet?.getView('Projects', 'default')
  
  // 监听当前行变化
  view?.events.on('currentRowChanged', (row) => {
    // 可以在这里添加当前行变化后的额外逻辑
  })
  
  // 监听行数据变化
  view?.events.on('rowsChanged', () => {
    // 可以在这里添加数据变化后的逻辑
  })
  
  // 初始化搜索关键词
  _pageState.searchKeyword = $query('[name="searchInput"]')?.value || ''
  
  // 保存原始数据引用
  if (view) {
    _pageState.originalRows = [...view.rows]
  }
  
  // 初始化删除按钮状态
  updateDeleteButtonState()
}

// 新增项目按钮处理
function handleAddProject() {
  const view = $dataSet?.getView('Projects', 'default')
  if (!view) return
  
  // 生成新ID（简单实现）
  const maxId = Math.max(...view.rows.map(row => row.id || 0), 0)
  const newId = maxId + 1
  
  // 创建新行数据
  const newRow = {
    id: newId,
    name: '',
    description: '',
    status: '规划中',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    budget: 0,
    progress: 0
  }
  
  // 追加新行
  view.appendRow(newRow)
  // 注意：框架会自动同步当前行，这里不需要调用 view.setCurrentRow(newRow)
  
  // 更新原始数据引用
  _pageState.originalRows = [...view.rows]
  
  $page.showMessage('已添加新项目', 'success')
}

// 删除项目按钮处理
function handleDeleteProject() {
  // 确保 selectedRows 是数组
  const selectedRows = Array.isArray(_pageState.selectedRows) ? _pageState.selectedRows : []
  
  if (selectedRows.length === 0) {
    $page.showMessage('请先选择要删除的项目', 'warning')
    return
  }
  
  $page.showConfirm(`确认删除选中的 ${selectedRows.length} 个项目吗？`).then((confirmed) => {
    if (!confirmed) return
    
    const view = $dataSet?.getView('Projects', 'default')
    if (!view) return
    
    // 记录删除数量
    const deleteCount = selectedRows.length
    
    // 删除选中的行
    selectedRows.forEach(row => {
      if (row && row.id) {
        view.deleteRowById(row.id)
      }
    })
    
    // 清空选中状态
    _pageState.selectedRows = []
    
    // 更新原始数据引用
    _pageState.originalRows = [...view.rows]
    
    // 更新删除按钮状态
    updateDeleteButtonState()
    
    $page.showMessage(`成功删除 ${deleteCount} 个项目`, 'success')
  })
}

// 搜索按钮处理
function handleSearch() {
  const keyword = $query('[name="searchInput"]')?.value || ''
  _pageState.searchKeyword = keyword.trim()
  
  const view = $dataSet?.getView('Projects', 'default')
  if (!view) return
  
  if (!_pageState.searchKeyword) {
    // 清空搜索，显示所有数据
    view.replaceRows(_pageState.originalRows || view.rows)
    $page.showMessage('已显示所有项目', 'info')
    return
  }
  
  // 执行搜索
  const filteredRows = (_pageState.originalRows || view.rows).filter(row => {
    return (
      row.name?.toLowerCase().includes(_pageState.searchKeyword.toLowerCase()) ||
      row.description?.toLowerCase().includes(_pageState.searchKeyword.toLowerCase()) ||
      row.status?.toLowerCase().includes(_pageState.searchKeyword.toLowerCase())
    )
  })
  
  view.replaceRows(filteredRows)
  
  if (filteredRows.length === 0) {
    $page.showMessage('未找到匹配的项目', 'warning')
  } else {
    $page.showMessage(`找到 ${filteredRows.length} 个匹配项目`, 'success')
  }
}

// 表格当前行变化处理
function handleCurrentChange(currentRow) {
  // 框架会自动同步当前行，这里只需要处理业务逻辑
  if (currentRow) {
    // 可以在这里添加当前行变化后的额外逻辑
  }
}

// 表格选择变化处理
function handleSelectionChange(selection) {
  // 确保 selection 是数组
  _pageState.selectedRows = Array.isArray(selection) ? selection : []
  
  // 更新删除按钮状态
  updateDeleteButtonState()
}

// 更新删除按钮状态
function updateDeleteButtonState() {
  const hasSelection = _pageState.selectedRows.length > 0
  const deleteBtn = $query('[name="deleteBtn"]')
  if (deleteBtn) deleteBtn.disabled = !hasSelection
}