function getOrdersTableApi() {
  return $components.getApi('ordersTable')
}

function waitOrdersTableApi(onReady, onTimeout) {
  var maxRetry = 20
  var intervalMs = 60
  var count = 0

  function poll() {
    var api = getOrdersTableApi()
    if (api) {
      onReady(api)
      return
    }

    count += 1
    if (count >= maxRetry) {
      if (onTimeout) onTimeout()
      return
    }

    setTimeout(poll, intervalMs)
  }

  poll()
}

function runWithOrdersTableApi(task) {
  var api = getOrdersTableApi()
  if (api) {
    task(api)
    return
  }

  waitOrdersTableApi(
    function(readyApi) {
      task(readyApi)
    },
    function() {
      $page.showMessage('ordersTable 仍未挂接完成，请稍后重试', 'warning')
    }
  )
}

function __init__() {
  // SparkPageRenderer 下 __init__ 可能早于深层组件挂接完成，
  // 这里仅做预热，不在初始化阶段提示“未找到组件”。
  waitOrdersTableApi(function() {}, function() {})
}

function refreshOrders() {
  runWithOrdersTableApi(function(api) {
    var dataSource = api.getDataSource ? api.getDataSource() : null
    var hasRemoteListApi = !!(dataSource && dataSource.dataTable && dataSource.dataTable.api && dataSource.dataTable.api.list)
    if (!hasRemoteListApi) {
      $page.showMessage('当前订单为内联数据，无需刷新', 'info')
      return
    }
    api.refresh()
  })
}

function selectFirstOrder() {
  runWithOrdersTableApi(function(api) {
    var rows = api.getRows()
    if (!rows || rows.length === 0) {
      $page.showMessage('当前无订单数据', 'warning')
      return
    }

    var firstRow = rows[0]
    if (api.setCurrentRow) {
      api.setCurrentRow(firstRow)
    } else if (api.setCurrentRowById && firstRow && firstRow.id !== undefined && firstRow.id !== null) {
      api.setCurrentRowById(firstRow.id)
    }

    api.doLayout()
    $page.showMessage('已定位到首行：' + (firstRow.orderNo || firstRow.id || '-'), 'success')
  })
}

function markCurrentOrderDone() {
  runWithOrdersTableApi(function(api) {
    var row = api.getCurrentRow()
    if (!row) {
      $page.showMessage('请先选中一条订单', 'warning')
      return
    }
    api.updateRowById(row.id, { status: 'done', priority: 'low' })
    $page.showMessage('当前订单已更新', 'success')
  })
}

function appendDemoOrder() {
  runWithOrdersTableApi(function(api) {
    api.appendRow({
      customer: '脚本新增客户',
      status: 'draft',
      priority: 'medium',
      owner: '脚本',
      amount: 6800,
      orderDate: '2026-03-18',
      region: 'east'
    })
    $page.showMessage('已通过脚本新增订单', 'success')
  })
}
