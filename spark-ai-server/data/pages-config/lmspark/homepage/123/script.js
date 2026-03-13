function __init__() {
  const view = $dataSet?.getView('Users', 'default');
  view?.events.on('currentRowChanged', (row) => {
    console.log('当前行变更:', row);
  });
}

function handleAdd() {
  $page.showMessage('新增功能待实现', 'info');
}

function handleRefresh() {
  $page.showMessage('刷新功能待实现', 'info');
}