let _pageState = { currentOrder: null }

function __init__() {
  const view = $dataSet?.getView('SalesOrders', 'default')
  view?.events.on('currentRowChanged', (row) => {
    _pageState.currentOrder = row
  })
}

function handleAdd() {
  $page.showPrompt('请输入新订单信息', '新增订单').then((data) => {
    if (data) {
      const view = $dataSet?.getView('SalesOrders', 'default')
      const newId = view.rows.length > 0 ? Math.max(...view.rows.map(r => r.id)) + 1 : 1
      view.appendRow({
        id: newId,
        orderNo: `SO2024${String(newId).padStart(3, '0')}`,
        customerName: data,
        orderDate: new Date().toISOString().split('T')[0],
        totalAmount: 0,
        status: '待处理'
      })
      $page.showMessage('订单已新增', 'success')
    }
  })
}

function handleEdit() {
  if (!_pageState.currentOrder) {
    $page.showMessage('请先选择一条订单', 'warning')
    return
  }
  $page.showPrompt('编辑客户名称', '编辑订单', _pageState.currentOrder.customerName).then((newName) => {
    if (newName) {
      const view = $dataSet?.getView('SalesOrders', 'default')
      view.updateRowById(_pageState.currentOrder.id, { customerName: newName })
      $page.showMessage('订单已更新', 'success')
    }
  })
}

function handleDelete() {
  if (!_pageState.currentOrder) {
    $page.showMessage('请先选择一条订单', 'warning')
    return
  }
  $page.showConfirm(`确认删除订单 ${_pageState.currentOrder.orderNo} 吗？`).then((ok) => {
    if (ok) {
      const view = $dataSet?.getView('SalesOrders', 'default')
      view.deleteRowById(_pageState.currentOrder.id)
      _pageState.currentOrder = null
      $page.showMessage('订单已删除', 'success')
    }
  })
}

function handleCurrentChange(currentRow) {
  _pageState.currentOrder = currentRow
}