// 页面状态
let _pageState = {
  drawerVisible: false,
  searchKeyword: ''
}

// 初始化
function __init__() {
  console.log('[数据权限管理] 页面初始化完成')
  
  // 订阅数据变化
  const view = $dataSet.getView('Permissions', 'default')
  view.events.on('currentRowChanged', handleCurrentRowChanged)
  view.events.on('rowsChanged', handleRowsChanged)
  
  // 初始加载数据
  $refreshData('Permissions')
}

// 数据变化处理
function handleCurrentRowChanged(currentRow) {
  if (currentRow) {
    _pageState.drawerVisible = true
    $rebindRules()
  }
}

function handleRowsChanged() {
  const view = $dataSet.getView('Permissions', 'default')
  console.log('权限数据已更新，共', view.rows.length, '条记录')
}

// 工具栏渲染函数
function RenderAddButton() {
  return h('button', {
    class: 'el-button el-button--primary',
    onClick: handleAddPermission
  }, '新增权限')
}

function RenderDeleteButton() {
  return h('button', {
    class: 'el-button el-button--danger',
    onClick: handleDeleteSelected,
    disabled: !$dataSet.getView('Permissions', 'default').selection.selectedRows.length
  }, '删除选中')
}

function RenderRefreshButton() {
  return h('button', {
    class: 'el-button el-button--default',
    onClick: () => $refreshData('Permissions')
  }, '刷新')
}

function RenderSearchBar() {
  return h('div', { class: 'search-bar' }, [
    h('input', {
      type: 'text',
      placeholder: '搜索权限名称...',
      value: _pageState.searchKeyword,
      onInput: (e) => {
        _pageState.searchKeyword = e.target.value
        handleSearch()
      }
    }),
    h('button', {
      class: 'el-button el-button--default',
      onClick: handleSearch
    }, '搜索')
  ])
}

// 操作列渲染函数
function RenderActions() {
  const view = $dataSet.getView('Permissions', 'default')
  const currentRow = view.currentRow
  
  return h('div', { class: 'action-buttons' }, [
    h('button', {
      class: 'el-button el-button--text',
      onClick: () => handleEdit(currentRow)
    }, '编辑'),
    h('button', {
      class: 'el-button el-button--text',
      onClick: () => handleToggleStatus(currentRow)
    }, currentRow && currentRow.status === 'active' ? '禁用' : '启用'),
    h('button', {
      class: 'el-button el-button--text el-button--danger',
      onClick: () => handleDelete(currentRow)
    }, '删除')
  ])
}

// 抽屉按钮渲染函数
function RenderSaveButton() {
  return h('button', {
    class: 'el-button el-button--primary',
    onClick: handleSavePermission
  }, '保存')
}

function RenderCancelButton() {
  return h('button', {
    class: 'el-button el-button--default',
    onClick: () => {
      _pageState.drawerVisible = false
      $rebindRules()
    }
  }, '取消')
}

// 业务处理函数
function handleAddPermission() {
  const view = $dataSet.getView('Permissions', 'default')
  const newId = Math.max(...view.rows.map(r => r.id), 0) + 1
  
  view.appendRow({
    id: newId,
    name: '新权限',
    type: 'user',
    target: '',
    status: 'active',
    createdAt: new Date().toISOString().split('T')[0],
    description: ''
  })
  
  view.selection.setCurrentRowById(newId, 'add')
  $page.showMessage('已创建新权限记录', 'success')
}

function handleEdit(row) {
  if (!row) return
  const view = $dataSet.getView('Permissions', 'default')
  view.selection.setCurrentRowById(row.id, 'edit')
}

function handleDelete(row) {
  if (!row) return
  
  $page.showConfirm(`确定要删除权限 "${row.name}" 吗？`, '删除确认')
    .then(() => {
      const view = $dataSet.getView('Permissions', 'default')
      view.deleteRowById(row.id)
      $page.showMessage('权限已删除', 'success')
    })
    .catch(() => {})
}

function handleDeleteSelected() {
  const view = $dataSet.getView('Permissions', 'default')
  const selectedRows = view.selection.selectedRows
  
  if (selectedRows.length === 0) {
    $page.showMessage('请先选择要删除的权限', 'warning')
    return
  }
  
  $page.showConfirm(`确定要删除选中的 ${selectedRows.length} 条权限记录吗？`, '批量删除确认')
    .then(() => {
      selectedRows.forEach(row => {
        view.deleteRowById(row.id)
      })
      $page.showMessage(`已删除 ${selectedRows.length} 条权限记录`, 'success')
    })
    .catch(() => {})
}

function handleToggleStatus(row) {
  if (!row) return
  
  const newStatus = row.status === 'active' ? 'inactive' : 'active'
  const view = $dataSet.getView('Permissions', 'default')
  
  view.updateRowById(row.id, { status: newStatus })
  
  const statusText = newStatus === 'active' ? '启用' : '禁用'
  $page.showMessage(`权限 "${row.name}" 已${statusText}`, 'success')
}

function handleSavePermission() {
  const view = $dataSet.getView('Permissions', 'default')
  const currentRow = view.currentRow
  
  if (!currentRow) return
  
  // 验证必填字段
  if (!currentRow.name || !currentRow.type) {
    $page.showMessage('权限名称和类型为必填项', 'error')
    return
  }
  
  // 如果是用户类型，需要目标用户
  if (currentRow.type === 'user' && !currentRow.target) {
    $page.showMessage('用户权限需要选择目标用户', 'error')
    return
  }
  
  // 保存逻辑（这里只是更新内存数据，实际应用中可能需要调用API）
  view.updateRowById(currentRow.id, currentRow)
  
  _pageState.drawerVisible = false
  $rebindRules()
  $page.showMessage('权限保存成功', 'success')
}

function handleSearch() {
  const view = $dataSet.getView('Permissions', 'default')
  const keyword = _pageState.searchKeyword.trim().toLowerCase()
  
  if (!keyword) {
    $refreshData('Permissions')
    return
  }
  
  // 内存过滤搜索
  const filteredRows = view.rows.filter(row => 
    row.name.toLowerCase().includes(keyword) || 
    (row.description && row.description.toLowerCase().includes(keyword))
  )
  
  view.replaceRows(filteredRows)
  $page.showMessage(`找到 ${filteredRows.length} 条匹配记录`, 'info')
}
