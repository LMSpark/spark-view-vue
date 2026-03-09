function __init__() {
  const customersView = $dataSet?.getView('Customers', 'default');
  const contactsView = $dataSet?.getView('Contacts', 'default');
  const followupsView = $dataSet?.getView('Followups', 'default');
  
  if (customersView) {
    customersView.events.on('currentRowChanged', (row) => {
      $page.showMessage(`已选择客户: ${row?.name || '无'}`, 'info');
    });
  }
}

function handleCustomerSelect(currentRow) {
  // 框架已自动同步 currentRow，这里可添加额外逻辑
  console.log('客户选择:', currentRow);
}
