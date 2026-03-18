function getPlayOrdersApi() {
  return $components.getApi('playOrdersTable')
}

function waitPlayOrdersApi(onReady, onTimeout) {
  var maxRetry = 20
  var intervalMs = 60
  var count = 0

  function poll() {
    var api = getPlayOrdersApi()
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

function runWithPlayOrdersApi(task) {
  var api = getPlayOrdersApi()
  if (api) {
    task(api)
    return
  }

  waitPlayOrdersApi(
    function(readyApi) {
      task(readyApi)
    },
    function() {
      $page.showMessage('playOrdersTable 仍未挂接完成，请稍后重试', 'warning')
    }
  )
}

function __init__() {
  waitPlayOrdersApi(function() {}, function() {})
}

function selectFirstOrder() {
  runWithPlayOrdersApi(function(api) {
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
  runWithPlayOrdersApi(function(api) {
    var row = api.getCurrentRow()
    if (!row) {
      $page.showMessage('请先选中一条订单', 'warning')
      return
    }

    api.updateRowById(row.id, {
      status: 'done',
      priority: 'low'
    })
    $page.showMessage('当前订单已更新为完成', 'success')
  })
}
