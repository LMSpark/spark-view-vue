function requireView(tableName, viewId) {
  const view = $dataSet?.getView(tableName, viewId || 'default')
  if (!view) throw new Error('DataView 不存在: ' + tableName + '@' + (viewId || 'default'))
  return view
}

function markDrafts() {
  const orders = requireView('TxOrders')
  const items = requireView('TxItems')
  orders.updateEditingValue(1, 'status', 'submitted')
  orders.updateEditingValue(1, 'owner', 'Ada Lovelace')
  items.updateEditingValue(101, 'quantity', 3)
  items.updateEditingValue(101, 'status', 'reserved')
  $page.showMessage('已写入 2 个订单字段和 2 个明细字段到 editingRows', 'success')
}

async function applyDrafts() {
  if (!$dataSet) throw new Error('DataSet 未就绪')
  const result = await $dataSet.saveChanges()
  if (!result.success) throw new Error(result.message || 'DataSet.saveChanges 失败')
  $page.showMessage(result.message || '编辑态已应用并保存', 'success')
}

function discardDrafts() {
  requireView('TxOrders').discardEditingRows()
  requireView('TxItems').discardEditingRows()
  $page.showMessage('已丢弃所有 editingRows', 'info')
}

function showEditingSummary() {
  const orders = requireView('TxOrders')
  const items = requireView('TxItems')
  $page.showAlert(
    '订单 editingRows: ' + orders.editingRows.length + '\n' +
    '明细 editingRows: ' + items.editingRows.length + '\n' +
    '订单 dirtyRows: ' + orders.dirtyRows.length + '\n' +
    '明细 dirtyRows: ' + items.dirtyRows.length,
    '编辑态状态'
  )
}
