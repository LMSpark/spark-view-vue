let _pageState = {
  selectedRows: [],
  searchKeyword: ''
}

function __init__() {
  const view = $dataSet?.getView('Students', 'default')
  
  // 监听当前行变化
  view?.events.on('currentRowChanged', (row) => {
    if (row) {
      // 自动打开对话框显示详情
      $api.setValue('dialogVisible', true)
    }
  })
  
  // 监听行数据变化
  view?.events.on('rowsChanged', () => {
    // 可以在这里添加数据变化后的逻辑
  })
  
  // 初始化搜索关键词
  _pageState.searchKeyword = $api.getValue('searchKeyword') || ''
}

// 新增按钮处理
function handleAdd() {
  const view = $dataSet?.getView('Students', 'default')
  if (!view) return
  
  // 生成新ID（简单实现）
  const maxId = Math.max(...view.rows.map(row => row.id || 0), 0)
  const newId = maxId + 1
  
  // 创建新行数据
  const newRow = {
    id: newId,
    studentId: `S${String(newId).padStart(3, '0')}`,
    name: '',
    className: '',
    chinese: 0,
    math: 0,
    english: 0
  }
  
  // 追加新行并设置为当前行
  view.appendRow(newRow)
  // 修复：使用 view.setCurrentRow 的正确方式，传入行对象
  view.setCurrentRow(newRow)
  
  $page.showMessage('已添加新学生记录', 'success')
}

// 删除按钮处理
function handleDelete() {
  if (_pageState.selectedRows.length === 0) {
    $page.showMessage('请先选择要删除的学生', 'warning')
    return
  }
  
  $page.showConfirm(`确认删除选中的 ${_pageState.selectedRows.length} 条记录吗？`).then((confirmed) => {
    if (!confirmed) return
    
    const view = $dataSet?.getView('Students', 'default')
    if (!view) return
    
    // 删除选中的行
    _pageState.selectedRows.forEach(row => {
      view.deleteRowById(row.id)
    })
    
    // 清空选中状态
    _pageState.selectedRows = []
    
    $page.showMessage(`成功删除 ${_pageState.selectedRows.length} 条记录`, 'success')
  })
}

// 搜索按钮处理
function handleSearch() {
  const keyword = $api.getValue('searchKeyword') || ''
  _pageState.searchKeyword = keyword.trim()
  
  const view = $dataSet?.getView('Students', 'default')
  if (!view) return
  
  if (!_pageState.searchKeyword) {
    // 清空搜索，显示所有数据
    view.replaceRows(view.originalRows || view.rows)
    $page.showMessage('已显示所有学生', 'info')
    return
  }
  
  // 保存原始数据（如果是第一次搜索）
  if (!view.originalRows) {
    view.originalRows = [...view.rows]
  }
  
  // 执行搜索
  const filteredRows = view.originalRows.filter(row => {
    return (
      row.name?.includes(_pageState.searchKeyword) ||
      row.studentId?.includes(_pageState.searchKeyword) ||
      row.className?.includes(_pageState.searchKeyword)
    )
  })
  
  view.replaceRows(filteredRows)
  
  if (filteredRows.length === 0) {
    $page.showMessage('未找到匹配的学生', 'warning')
  } else {
    $page.showMessage(`找到 ${filteredRows.length} 条匹配记录`, 'success')
  }
}

// 表格当前行变化处理
function handleCurrentChange(currentRow) {
  // 框架会自动同步当前行，这里只需要处理业务逻辑
  if (currentRow) {
    // 可以在这里添加当前行变化后的额外逻辑
  }
}

// 表格选择变化处理（通过事件绑定）
function handleSelectionChange(selection) {
  _pageState.selectedRows = selection || []
}

// 保存按钮处理
function handleSave() {
  const view = $dataSet?.getView('Students', 'default')
  if (!view || !view.currentRow) {
    $page.showMessage('没有可保存的数据', 'warning')
    return
  }
  
  // 验证必填字段
  const currentRow = view.currentRow
  if (!currentRow.studentId || !currentRow.name || !currentRow.className) {
    $page.showMessage('学号、姓名和班级为必填项', 'error')
    return
  }
  
  // 验证分数范围
  if (
    currentRow.chinese < 0 || currentRow.chinese > 100 ||
    currentRow.math < 0 || currentRow.math > 100 ||
    currentRow.english < 0 || currentRow.english > 100
  ) {
    $page.showMessage('各科成绩必须在0-100分之间', 'error')
    return
  }
  
  // 更新数据
  view.updateRowById(currentRow.id, {
    studentId: currentRow.studentId,
    name: currentRow.name,
    className: currentRow.className,
    chinese: Number(currentRow.chinese) || 0,
    math: Number(currentRow.math) || 0,
    english: Number(currentRow.english) || 0
  })
  
  // 关闭对话框
  $api.setValue('dialogVisible', false)
  
  $page.showMessage('学生成绩保存成功', 'success')
}

// 取消按钮处理
function handleCancel() {
  // 关闭对话框
  $api.setValue('dialogVisible', false)
  
  // 可以在这里添加取消时的数据恢复逻辑
  const view = $dataSet?.getView('Students', 'default')
  if (view && view.currentRow) {
    // 重置当前行的编辑状态
    // 注意：r-form会自动处理，这里不需要额外操作
  }
  
  $page.showMessage('已取消编辑', 'info')
}

// 计算总分和平均分（辅助函数）
function calculateScores(row) {
  if (!row) return { total: 0, average: 0 }
  
  const chinese = Number(row.chinese) || 0
  const math = Number(row.math) || 0
  const english = Number(row.english) || 0
  
  const total = chinese + math + english
  const average = total / 3
  
  return { total, average }
}