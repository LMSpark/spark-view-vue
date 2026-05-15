const TX_API_BASE = '/api/tenants/lmspark/projects/homepage'

function createService(api) {
  return SparkData.createCrudService(api)
}

function modelService() {
  return createService({
    list: { url: TX_API_BASE + '/data-model/tables', method: 'GET' },
    create: { url: TX_API_BASE + '/data-model/tables', method: 'POST' }
  })
}

function transactionService() {
  return createService({
    create: { url: TX_API_BASE + '/data/transactions', method: 'POST' }
  })
}

function dynamicTableColumns(kind) {
  if (kind === 'order') {
    return [
      { name: 'id', type: 'number', primaryKey: true, autoIncrement: false, label: '订单ID' },
      { name: 'orderNo', type: 'string', label: '订单号' },
      { name: 'owner', type: 'string', label: '负责人' },
      { name: 'status', type: 'string', label: '状态' }
    ]
  }
  return [
    { name: 'id', type: 'number', primaryKey: true, autoIncrement: false, label: '明细ID' },
    { name: 'orderId', type: 'number', label: '订单ID' },
    { name: 'sku', type: 'string', label: 'SKU' },
    { name: 'quantity', type: 'number', label: '数量' },
    { name: 'status', type: 'string', label: '状态' }
  ]
}

function requireSuccess(result, actionName) {
  if (!result || result.success !== true) {
    throw new Error(actionName + '失败: ' + (result?.message || '未知错误'))
  }
  return result.data
}

async function ensureDynamicTable(tableName, columns) {
  const service = modelService()
  const tables = requireSuccess(await service.list(), '读取动态表清单')
  const exists = Array.isArray(tables) && tables.some((table) => table.logicalTableName === tableName || table.tableName === tableName)
  if (exists) return 'exists'
  requireSuccess(await service.create({ tableName, columns }), '创建动态表 ' + tableName)
  return 'created'
}

async function callTransaction(body) {
  return requireSuccess(await transactionService().create(body), '提交事务')
}

async function prepareTransactionTables() {
  const orderState = await ensureDynamicTable('SparkTxOrders', dynamicTableColumns('order'))
  const itemState = await ensureDynamicTable('SparkTxItems', dynamicTableColumns('item'))
  $page.showMessage('测试表状态: Orders=' + orderState + ', Items=' + itemState, 'success')
}

async function seedTransactionData() {
  await prepareTransactionTables()
  const result = await callTransaction({
    requestId: 'tx-config-seed-v1',
    operations: [
      {
        operationId: 'seed-order',
        tableName: 'SparkTxOrders',
        op: 'create',
        data: { id: 9001, orderNo: 'TX-BE-001', owner: 'Morgan', status: 'draft' }
      },
      {
        operationId: 'seed-item',
        tableName: 'SparkTxItems',
        op: 'create',
        data: { id: 9101, orderId: 9001, sku: 'SKU-TX', quantity: 1, status: 'draft' }
      }
    ]
  })
  await reloadTransactionViews()
  $page.showMessage('种子事务完成' + (result.replayed ? '（replay）' : ''), 'success')
}

async function commitTransactionUpdate() {
  await prepareTransactionTables()
  const requestId = 'tx-config-update-' + Date.now()
  const result = await callTransaction({
    requestId,
    operations: [
      {
        operationId: 'update-order',
        tableName: 'SparkTxOrders',
        op: 'update',
        pk: { id: 9001 },
        data: { owner: 'Morgan Updated', status: 'submitted' }
      },
      {
        operationId: 'update-item',
        tableName: 'SparkTxItems',
        op: 'update',
        pk: { id: 9101 },
        data: { quantity: 5, status: 'reserved' }
      }
    ]
  })
  await reloadTransactionViews()
  $page.showMessage('多表事务已提交: ' + result.transactionId, 'success')
}

async function reloadTransactionViews() {
  const orders = $dataSet?.getView('SparkTxOrders', 'default')
  const items = $dataSet?.getView('SparkTxItems', 'default')
  if (orders) await orders.refresh()
  if (items) await items.refresh()
}
