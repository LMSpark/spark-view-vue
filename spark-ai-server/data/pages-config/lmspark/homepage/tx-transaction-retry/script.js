const RETRY_API_BASE = '/api/tenants/lmspark/projects/homepage'

function createRetryService(api) {
  return SparkData.createCrudService(api)
}

function retryModelService() {
  return createRetryService({
    list: { url: RETRY_API_BASE + '/data-model/tables', method: 'GET' },
    create: { url: RETRY_API_BASE + '/data-model/tables', method: 'POST' }
  })
}

function retryTransactionService() {
  return createRetryService({
    create: { url: RETRY_API_BASE + '/data/transactions', method: 'POST' }
  })
}

function auditColumns() {
  return [
    { name: 'id', type: 'number', primaryKey: true, autoIncrement: false, label: '审计ID' },
    { name: 'requestKey', type: 'string', label: '请求键' },
    { name: 'message', type: 'string', label: '消息' },
    { name: 'status', type: 'string', label: '状态' }
  ]
}

function requireRetrySuccess(result, actionName) {
  if (!result || result.success !== true) {
    throw new Error(actionName + '失败: ' + (result?.message || '未知错误'))
  }
  return result.data
}

async function prepareRetryTable() {
  const service = retryModelService()
  const tables = requireRetrySuccess(await service.list(), '读取动态表清单')
  const exists = Array.isArray(tables) && tables.some((table) => table.logicalTableName === 'SparkTxAudit' || table.tableName === 'SparkTxAudit')
  if (!exists) {
    requireRetrySuccess(await service.create({ tableName: 'SparkTxAudit', columns: auditColumns() }), '创建审计表')
  }
  $page.showMessage(exists ? '审计表已存在' : '审计表已创建', 'success')
}

async function retryTransaction(body) {
  return requireRetrySuccess(await retryTransactionService().create(body), '提交事务')
}

function replayBody() {
  return {
    requestId: 'tx-config-retry-v1',
    operations: [
      {
        operationId: 'create-audit-row',
        tableName: 'SparkTxAudit',
        op: 'create',
        data: { id: 9201, requestKey: 'tx-config-retry-v1', message: 'first-submit', status: 'committed' }
      }
    ]
  }
}

async function runReplayTwice() {
  await prepareRetryTable()
  const first = await retryTransaction(replayBody())
  const second = await retryTransaction(replayBody())
  if (second.replayed !== true) throw new Error('第二次请求没有 replay')
  if (first.transactionId !== second.transactionId) throw new Error('replay 返回的 transactionId 不一致')
  await reloadAuditView()
  $page.showMessage('重试 replay 成功: ' + second.transactionId, 'success')
}

async function runRequestIdConflict() {
  await prepareRetryTable()
  await retryTransaction(replayBody())
  const conflict = replayBody()
  conflict.operations[0].data.message = 'changed-payload'
  const result = await retryTransactionService().create(conflict)
  if (result.success === true) throw new Error('后端没有拒绝 requestId payload 冲突')
  $page.showMessage('冲突 payload 已被拒绝: ' + (result.message || 'requestId 冲突'), 'success')
}

async function reloadAuditView() {
  const view = $dataSet?.getView('SparkTxAudit', 'default')
  if (view) await view.refresh()
}
