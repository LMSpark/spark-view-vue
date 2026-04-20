let _pageState = {}

function __init__() {
  // 初始化页面状态
  _pageState.activeTab = 'orders'
  
  // 订阅订单表当前行变化，用于联动明细
  const ordersView = $dataSet?.getView('Orders', 'default')
  if (ordersView) {
    ordersView.events.on('currentRowChanged', (currentRow) => {
      // 框架已通过 tableRelation 自动处理联动，此处可添加额外逻辑
      if (currentRow) {
        $page.showMessage(`已选中订单: ${currentRow.orderNo}`, 'info')
      }
    })
  }
  
  // 订阅客户表当前行变化，用于联动联系人
  const customersView = $dataSet?.getView('Customers', 'default')
  if (customersView) {
    customersView.events.on('currentRowChanged', (currentRow) => {
      if (currentRow) {
        $page.showMessage(`已选中客户: ${currentRow.name}`, 'info')
      }
    })
  }
}

// 工具栏渲染函数
function RenderToolbar() {
  return h('div', { style: { display: 'flex', gap: '8px', marginBottom: '16px' } }, [
    h('button', {
      style: { padding: '8px 16px', backgroundColor: '#409eff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
      onClick: handleAddOrder
    }, '新建订单'),
    h('button', {
      style: { padding: '8px 16px', backgroundColor: '#67c23a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
      onClick: handleRefresh
    }, '刷新数据'),
    h('button', {
      style: { padding: '8px 16px', backgroundColor: '#909399', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
      onClick: handleExport
    }, '导出数据')
  ])
}

// 订单行操作渲染函数（安全兜底）
function RenderRowActions(props) {
  const row = props?.row || props?.scope?.row || props?.data?.row || null
  if (!row) return h('span', '')
  
  return h('div', { style: { display: 'flex', gap: '4px' } }, [
    h('button', {
      style: { padding: '4px 8px', fontSize: '12px', backgroundColor: '#409eff', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer' },
      onClick: () => handleEditOrder(row)
    }, '编辑'),
    h('button', {
      style: { padding: '4px 8px', fontSize: '12px', backgroundColor: '#f56c6c', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer' },
      onClick: () => handleDeleteOrder(row)
    }, '删除')
  ])
}

// 订单明细操作渲染函数
function RenderDetailActions() {
  return h('div', { style: { display: 'flex', gap: '8px' } }, [
    h('button', {
      style: { padding: '6px 12px', fontSize: '14px', backgroundColor: '#409eff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
      onClick: handleAddOrderItem
    }, '添加明细'),
    h('button', {
      style: { padding: '6px 12px', fontSize: '14px', backgroundColor: '#f56c6c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
      onClick: handleClearOrderItems
    }, '清空明细')
  ])
}

// 客户行操作渲染函数（安全兜底）
function RenderCustomerActions(props) {
  const row = props?.row || props?.scope?.row || props?.data?.row || null
  if (!row) return h('span', '')
  
  return h('div', { style: { display: 'flex', gap: '4px' } }, [
    h('button', {
      style: { padding: '4px 8px', fontSize: '12px', backgroundColor: '#409eff', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer' },
      onClick: () => handleEditCustomer(row)
    }, '编辑'),
    h('button', {
      style: { padding: '4px 8px', fontSize: '12px', backgroundColor: '#f56c6c', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer' },
      onClick: () => handleDeleteCustomer(row)
    }, '删除')
  ])
}

// 联系人操作渲染函数
function RenderContactActions() {
  return h('div', { style: { display: 'flex', gap: '8px' } }, [
    h('button', {
      style: { padding: '6px 12px', fontSize: '14px', backgroundColor: '#409eff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
      onClick: handleAddContact
    }, '添加联系人'),
    h('button', {
      style: { padding: '6px 12px', fontSize: '14px', backgroundColor: '#f56c6c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
      onClick: handleClearContacts
    }, '清空联系人')
  ])
}

// 产品行操作渲染函数（安全兜底）
function RenderProductActions(props) {
  const row = props?.row || props?.scope?.row || props?.data?.row || null
  if (!row) return h('span', '')
  
  return h('div', { style: { display: 'flex', gap: '4px' } }, [
    h('button', {
      style: { padding: '4px 8px', fontSize: '12px', backgroundColor: '#409eff', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer' },
      onClick: () => handleEditProduct(row)
    }, '编辑'),
    h('button', {
      style: { padding: '4px 8px', fontSize: '12px', backgroundColor: '#f56c6c', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer' },
      onClick: () => handleDeleteProduct(row)
    }, '删除')
  ])
}

// 事件处理函数
function handleAddOrder() {
  $page.showMessage('新建订单功能待实现', 'info')
}

function handleRefresh() {
  $refreshData()
  $page.showMessage('数据已刷新', 'success')
}

function handleExport() {
  $page.showMessage('导出数据功能待实现', 'info')
}

function handleEditOrder(row) {
  $page.showMessage(`编辑订单: ${row.orderNo}`, 'info')
}

function handleDeleteOrder(row) {
  $page.showConfirm(`确定删除订单 ${row.orderNo} 吗？`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const view = $dataSet?.getView('Orders', 'default')
    if (view) {
      view.deleteRowById(row.id)
      $page.showMessage('订单已删除', 'success')
    }
  }).catch(() => {})
}

function handleAddOrderItem() {
  $page.showMessage('添加订单明细功能待实现', 'info')
}

function handleClearOrderItems() {
  $page.showConfirm('确定清空当前订单的所有明细吗？', '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const view = $dataSet?.getView('OrderItems', 'default')
    if (view) {
      view.replaceRows([])
      $page.showMessage('订单明细已清空', 'success')
    }
  }).catch(() => {})
}

function handleEditCustomer(row) {
  $page.showMessage(`编辑客户: ${row.name}`, 'info')
}

function handleDeleteCustomer(row) {
  $page.showConfirm(`确定删除客户 ${row.name} 吗？`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const view = $dataSet?.getView('Customers', 'default')
    if (view) {
      view.deleteRowById(row.id)
      $page.showMessage('客户已删除', 'success')
    }
  }).catch(() => {})
}

function handleAddContact() {
  $page.showMessage('添加联系人功能待实现', 'info')
}

function handleClearContacts() {
  $page.showConfirm('确定清空当前客户的所有联系人吗？', '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const view = $dataSet?.getView('Contacts', 'default')
    if (view) {
      view.replaceRows([])
      $page.showMessage('联系人已清空', 'success')
    }
  }).catch(() => {})
}

function handleEditProduct(row) {
  $page.showMessage(`编辑产品: ${row.name}`, 'info')
}

function handleDeleteProduct(row) {
  $page.showConfirm(`确定删除产品 ${row.name} 吗？`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const view = $dataSet?.getView('Products', 'default')
    if (view) {
      view.deleteRowById(row.id)
      $page.showMessage('产品已删除', 'success')
    }
  }).catch(() => {})
}