// 订单视图：DataSet → DataTable('Orders') → DataView('default')
function getOrdersView() {
  return $dataSet && $dataSet.getView('Orders', 'default')
}

function __init__() {}

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
  $page.showMessage('当前订单已更新为完成', 'success')
}