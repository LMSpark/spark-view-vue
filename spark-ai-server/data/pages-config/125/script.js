let _pageState = { selectedRow: null, filterValues: { name: '', age: '', status: '' } }

function __init__() {
  const view = $dataSet?.getView('Users', 'default')
  if (view) {
    view.events.on('currentRowChanged', (row) => {
      _pageState.selectedRow = row
      console.log('当前行已变更:', row)
    })
  }
}

function RenderToolbar() {
  return h('div', { class: 'toolbar-buttons' }, [
    h('button', { onClick: handleAdd, style: { backgroundColor: '#409eff', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' } }, '新增'),
    h('button', { onClick: handleEdit, style: { backgroundColor: '#67c23a', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' } }, '编辑'),
    h('button', { onClick: handleDelete, style: { backgroundColor: '#f56c6c', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' } }, '删除'),
    h('button', { onClick: handleResetFilter, style: { backgroundColor: '#909399', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' } }, '重置过滤')
  ])
}

function RenderRowActions(props) {
  const row = props.row
  return h('div', { class: 'row-actions' }, [
    h('button', { onClick: () => handleEditRow(row), style: { backgroundColor: '#67c23a', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' } }, '编辑'),
    h('button', { onClick: () => handleDeleteRow(row), style: { backgroundColor: '#f56c6c', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' } }, '删除')
  ])
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

function handleEditRow(row) {
  const view = $dataSet?.getView('Users', 'default')
  if (view) {
    view.selection.setCurrentRowById(row.id, 'row-action')
    $page.showMessage(`编辑行: ${row.name}`, 'info')
  }
}

function handleDeleteRow(row) {
  $page.showConfirm(`确认删除用户 ${row.name} 吗？`).then((ok) => {
    if (ok) {
      const view = $dataSet?.getView('Users', 'default')
      if (view) {
        view.deleteRowById(row.id)
        $page.showMessage('删除成功', 'success')
      }
    }
  })
}

function handleResetFilter() {
  _pageState.filterValues = { name: '', age: '', status: '' }
  const view = $dataSet?.getView('Users', 'default')
  if (view) {
    view.replaceRows(view.rows)
    $page.showMessage('过滤已重置', 'info')
  }
}

function handleFilterChange(field, value) {
  _pageState.filterValues[field] = value
}

function handleApplyFilter() {
  const view = $dataSet?.getView('Users', 'default')
  if (!view) return
  
  const filteredRows = view.rows.filter(row => {
    const nameMatch = !_pageState.filterValues.name || row.name.includes(_pageState.filterValues.name)
    const ageMatch = !_pageState.filterValues.age || row.age.toString().includes(_pageState.filterValues.age)
    const statusMatch = !_pageState.filterValues.status || row.status === _pageState.filterValues.status
    return nameMatch && ageMatch && statusMatch
  })
  
  view.replaceRows(filteredRows)
  $page.showMessage(`过滤完成，显示 ${filteredRows.length} 条记录`, 'info')
}