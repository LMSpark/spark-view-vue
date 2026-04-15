// 订单视图：DataSet → DataTable('Orders') → DataView('default')
function getOrdersView() {
  return $dataSet && $dataSet.getView('Orders', 'default')
}

function __init__() {}

function refreshOrders() {
  var view = getOrdersView()
  if (!view || !view.crudService) {
    $page.showMessage('当前订单为内联数据，无需刷新', 'info')
    return
  }
  view.refresh()
}

function selectFirstOrder() {
  var view = getOrdersView()
  if (!view) return
  var rows = view.rows
  if (!rows || rows.length === 0) {
    $page.showMessage('当前无订单数据', 'warning')
    return
  }
  var firstRow = rows[0]
  view.setCurrentRow(firstRow)
  $page.showMessage('已定位到首行：' + (firstRow.orderNo || firstRow.id || '-'), 'success')
}

function markCurrentOrderDone() {
  var view = getOrdersView()
  if (!view) return
  var row = view.currentRow
  if (!row) {
    $page.showMessage('请先选中一条订单', 'warning')
    return
  }
  view.updateRowById(row.id, { status: 'done', priority: 'low' })
  $page.showMessage('当前订单已更新', 'success')
}

function appendDemoOrder() {
  var view = getOrdersView()
  if (!view) return
  view.appendRow({
    customer: '脚本新增客户',
    status: 'draft',
    priority: 'medium',
    owner: '脚本',
    amount: 6800,
    orderDate: '2026-03-18',
    region: 'east'
  })
  $page.showMessage('已通过脚本新增订单', 'success')
}