let _pageState = {};

function __init__() {
  // 初始化页面状态
  _pageState = {
    dialogVisible: false,
    currentDialogType: ''
  };
  
  // 监听订单当前行变化，框架会自动通过 tableRelation 更新 OrderItems 数据
  const ordersView = $dataSet?.getView('Orders', 'default');
  if (ordersView) {
    ordersView.events.on('currentRowChanged', (currentRow) => {
      // 当前行变化时，可以在这里执行一些额外的逻辑
      // 例如：更新页面状态、记录日志等
      if (currentRow) {
        console.log('当前选中订单:', currentRow.orderNo);
      }
    });
  }
}

// 工具栏渲染函数
function RenderToolbar() {
  return h('div', { style: { display: 'flex', gap: '8px' } }, [
    h('button', {
      class: 'el-button el-button--primary',
      onClick: handleAddOrder
    }, '新建订单'),
    h('button', {
      class: 'el-button el-button--success',
      onClick: handleRefreshOrders
    }, '刷新'),
    h('button', {
      class: 'el-button el-button--danger',
      onClick: handleDeleteSelectedOrders
    }, '删除选中')
  ]);
}

function RenderTableToolbar() {
  return h('div', { style: { display: 'flex', gap: '8px' } }, [
    h('button', {
      class: 'el-button el-button--default',
      onClick: handleExportOrders
    }, '导出'),
    h('button', {
      class: 'el-button el-button--default',
      onClick: handlePrintOrders
    }, '打印')
  ]);
}

function RenderOrderItemToolbar() {
  return h('div', { style: { display: 'flex', gap: '8px' } }, [
    h('button', {
      class: 'el-button el-button--primary',
      onClick: handleAddOrderItem
    }, '新增明细'),
    h('button', {
      class: 'el-button el-button--default',
      onClick: handleRefreshOrderItems
    }, '刷新明细')
  ]);
}

// 行操作渲染函数
function RenderRowActions(props) {
  // 安全获取行数据
  const row = props?.row || props?.scope?.row || props?.data?.row || null;
  if (!row) return h('span', '');
  
  return h('div', { style: { display: 'flex', gap: '4px' } }, [
    h('button', {
      class: 'el-button el-button--text',
      onClick: () => handleEditOrder(row)
    }, '编辑'),
    h('button', {
      class: 'el-button el-button--text el-button--danger',
      onClick: () => handleDeleteOrder(row)
    }, '删除')
  ]);
}

function RenderOrderItemActions(props) {
  // 安全获取行数据
  const row = props?.row || props?.scope?.row || props?.data?.row || null;
  if (!row) return h('span', '');
  
  return h('div', { style: { display: 'flex', gap: '4px' } }, [
    h('button', {
      class: 'el-button el-button--text',
      onClick: () => handleEditOrderItem(row)
    }, '编辑'),
    h('button', {
      class: 'el-button el-button--text el-button--danger',
      onClick: () => handleDeleteOrderItem(row)
    }, '删除')
  ]);
}

// 事件处理函数
function handleAddOrder() {
  $page.showMessage({ type: 'info', message: '新建订单功能待实现' });
}

function handleRefreshOrders() {
  const view = $dataSet?.getView('Orders', 'default');
  if (view) {
    // 这里可以调用远程 API 刷新数据
    $page.showMessage({ type: 'success', message: '刷新成功' });
  }
}

function handleDeleteSelectedOrders() {
  const view = $dataSet?.getView('Orders', 'default');
  if (!view) return;
  
  const selectedRows = view.selection.selectedRows;
  if (selectedRows.length === 0) {
    $page.showMessage({ type: 'warning', message: '请先选择要删除的订单' });
    return;
  }
  
  $page.showConfirm({
    title: '确认删除',
    message: `确定要删除选中的 ${selectedRows.length} 个订单吗？`,
    onConfirm: () => {
      // 这里执行删除逻辑
      $page.showMessage({ type: 'success', message: '删除成功' });
    }
  });
}

function handleExportOrders() {
  $page.showMessage({ type: 'info', message: '导出功能待实现' });
}

function handlePrintOrders() {
  $page.showMessage({ type: 'info', message: '打印功能待实现' });
}

function handleAddOrderItem() {
  const ordersView = $dataSet?.getView('Orders', 'default');
  if (!ordersView?.currentRow) {
    $page.showMessage({ type: 'warning', message: '请先选择一个订单' });
    return;
  }
  $page.showMessage({ type: 'info', message: '新增订单明细功能待实现' });
}

function handleRefreshOrderItems() {
  $page.showMessage({ type: 'success', message: '刷新明细成功' });
}

function handleEditOrder(row) {
  $page.showMessage({ type: 'info', message: `编辑订单: ${row.orderNo}` });
}

function handleDeleteOrder(row) {
  $page.showConfirm({
    title: '确认删除',
    message: `确定要删除订单 ${row.orderNo} 吗？`,
    onConfirm: () => {
      // 这里执行删除逻辑
      $page.showMessage({ type: 'success', message: '删除成功' });
    }
  });
}

function handleEditOrderItem(row) {
  $page.showMessage({ type: 'info', message: '编辑订单明细功能待实现' });
}

function handleDeleteOrderItem(row) {
  $page.showConfirm({
    title: '确认删除',
    message: '确定要删除这个订单明细吗？',
    onConfirm: () => {
      // 这里执行删除逻辑
      $page.showMessage({ type: 'success', message: '删除成功' });
    }
  });
}