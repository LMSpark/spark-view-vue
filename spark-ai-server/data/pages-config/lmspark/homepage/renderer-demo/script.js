let _pageState = {}

function __init__() {
  // 初始化页面状态
  _pageState.currentTab = 'order-list'
  
  // 监听订单当前行变化，用于调试或自定义逻辑
  const ordersView = $dataSet?.getView('Orders', 'default')
  if (ordersView) {
    ordersView.events.on('currentRowChanged', (currentRow) => {
      console.log('订单当前行变化:', currentRow?.orderNo)
    })
    
    ordersView.events.on('selectedRowsChanged', (selectedRows) => {
      console.log('订单选中行变化:', selectedRows.length)
    })
  }
  
  // 监听商品明细行变化
  const itemsView = $dataSet?.getView('OrderItems', 'default')
  if (itemsView) {
    itemsView.events.on('selectedRowsChanged', (selectedRows) => {
      console.log('商品明细选中行变化:', selectedRows.length)
    })
  }
}

// ========== 工具栏渲染函数 ==========

function RenderToolbarActions() {
  return h('div', { style: { display: 'flex', gap: '8px' } }, [
    h('button', {
      class: 'el-button el-button--primary el-button--small',
      onClick: handleCreateOrder
    }, '新建订单'),
    h('button', {
      class: 'el-button el-button--success el-button--small',
      onClick: handleExportOrders
    }, '导出数据'),
    h('button', {
      class: 'el-button el-button--info el-button--small',
      onClick: handleRefreshData
    }, '刷新')
  ])
}

function RenderTableToolbar() {
  const ordersView = $dataSet?.getView('Orders', 'default')
  const selectedCount = ordersView?.selection?.selectedRows?.length || 0
  
  return h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
    h('span', { style: { fontSize: '14px', color: '#666' } }, `已选 ${selectedCount} 项`),
    selectedCount > 0 && h('button', {
      class: 'el-button el-button--danger el-button--small',
      onClick: handleBatchDelete
    }, '批量删除'),
    h('button', {
      class: 'el-button el-button--warning el-button--small',
      onClick: handleBatchUpdateStatus
    }, '批量更新状态')
  ])
}

function RenderFilterPanel() {
  return h('div', { style: { padding: '12px', background: '#f8f9fa', borderRadius: '4px' } }, [
    h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } }, [
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
        h('span', { style: { fontSize: '14px', minWidth: '60px' } }, '订单号:'),
        h('input', {
          type: 'text',
          placeholder: '输入订单号',
          style: { padding: '6px 8px', border: '1px solid #dcdfe6', borderRadius: '4px', width: '150px' },
          onInput: handleFilterOrderNo
        })
      ]),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
        h('span', { style: { fontSize: '14px', minWidth: '60px' } }, '状态:'),
        h('select', {
          style: { padding: '6px 8px', border: '1px solid #dcdfe6', borderRadius: '4px', width: '120px' },
          onChange: handleFilterStatus
        }, [
          h('option', { value: '' }, '全部'),
          h('option', { value: 'pending' }, '待处理'),
          h('option', { value: 'processing' }, '处理中'),
          h('option', { value: 'completed' }, '已完成')
        ])
      ]),
      h('button', {
        class: 'el-button el-button--default el-button--small',
        onClick: handleResetFilter
      }, '重置')
    ])
  ])
}

// ========== 行操作渲染函数 ==========

function RenderRowActions(props) {
  const row = props?.row || props?.scope?.row || props?.data?.row || null
  if (!row) return h('span', '')
  
  return h('div', { style: { display: 'flex', gap: '4px' } }, [
    h('button', {
      class: 'el-button el-button--text el-button--small',
      onClick: () => handleViewDetail(row.id)
    }, '查看'),
    h('button', {
      class: 'el-button el-button--text el-button--small',
      onClick: () => handleEditOrder(row.id)
    }, '编辑'),
    h('button', {
      class: 'el-button el-button--text el-button--small',
      style: { color: row.status === 'completed' ? '#909399' : '#f56c6c' },
      disabled: row.status === 'completed',
      onClick: () => handleDeleteOrder(row.id)
    }, '删除')
  ])
}

function RenderOrderItemActions() {
  const ordersView = $dataSet?.getView('Orders', 'default')
  const currentOrder = ordersView?.currentRow
  
  return h('div', { style: { display: 'flex', gap: '8px' } }, [
    h('button', {
      class: 'el-button el-button--primary el-button--small',
      disabled: !currentOrder,
      onClick: handleAddOrderItem
    }, '添加商品'),
    h('button', {
      class: 'el-button el-button--danger el-button--small',
      disabled: !currentOrder,
      onClick: handleClearOrderItems
    }, '清空明细')
  ])
}

function RenderOrderItemRowActions(props) {
  const row = props?.row || props?.scope?.row || props?.data?.row || null
  if (!row) return h('span', '')
  
  return h('div', { style: { display: 'flex', gap: '4px' } }, [
    h('button', {
      class: 'el-button el-button--text el-button--small',
      onClick: () => handleEditOrderItem(row.id)
    }, '编辑'),
    h('button', {
      class: 'el-button el-button--text el-button--small',
      style: { color: '#f56c6c' },
      onClick: () => handleDeleteOrderItem(row.id)
    }, '删除')
  ])
}

// ========== 事件处理函数 ==========

function handleCreateOrder() {
  $page.showMessage({ type: 'info', message: '新建订单功能待实现' })
}

function handleExportOrders() {
  $page.showMessage({ type: 'success', message: '导出数据功能待实现' })
}

function handleRefreshData() {
  $refreshData()
  $page.showMessage({ type: 'success', message: '数据已刷新' })
}

function handleBatchDelete() {
  const ordersView = $dataSet?.getView('Orders', 'default')
  const selectedRows = ordersView?.selection?.selectedRows || []
  
  if (selectedRows.length === 0) {
    $page.showMessage({ type: 'warning', message: '请先选择要删除的订单' })
    return
  }
  
  $page.showConfirm({
    title: '确认删除',
    message: `确定要删除选中的 ${selectedRows.length} 个订单吗？`,
    onConfirm: () => {
      // 实际应调用 API 删除
      $page.showMessage({ type: 'success', message: `已删除 ${selectedRows.length} 个订单` })
      // 清空选中
      ordersView.selection.setSelectedRowsById([], 'batch-delete')
    }
  })
}

function handleBatchUpdateStatus() {
  $page.showMessage({ type: 'info', message: '批量更新状态功能待实现' })
}

function handleFilterOrderNo(event) {
  console.log('过滤订单号:', event.target.value)
}

function handleFilterStatus(event) {
  console.log('过滤状态:', event.target.value)
}

function handleResetFilter() {
  console.log('重置过滤器')
}

function handleViewDetail(orderId) {
  const ordersView = $dataSet?.getView('Orders', 'default')
  if (ordersView) {
    ordersView.selection.setCurrentRowById(orderId, 'view-detail')
    // 切换到详情标签页
    _pageState.currentTab = 'order-detail'
  }
}

function handleEditOrder(orderId) {
  $page.showMessage({ type: 'info', message: `编辑订单 ${orderId} 功能待实现` })
}

function handleDeleteOrder(orderId) {
  $page.showConfirm({
    title: '确认删除',
    message: '确定要删除这个订单吗？',
    onConfirm: () => {
      $page.showMessage({ type: 'success', message: '订单已删除' })
    }
  })
}

function handleAddOrderItem() {
  $page.showMessage({ type: 'info', message: '添加商品功能待实现' })
}

function handleClearOrderItems() {
  $page.showConfirm({
    title: '确认清空',
    message: '确定要清空当前订单的所有商品明细吗？',
    onConfirm: () => {
      $page.showMessage({ type: 'success', message: '商品明细已清空' })
    }
  })
}

function handleEditOrderItem(itemId) {
  $page.showMessage({ type: 'info', message: `编辑商品 ${itemId} 功能待实现` })
}

function handleDeleteOrderItem(itemId) {
  $page.showConfirm({
    title: '确认删除',
    message: '确定要删除这个商品吗？',
    onConfirm: () => {
      $page.showMessage({ type: 'success', message: '商品已删除' })
    }
  })
}