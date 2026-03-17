let _pageState = {};

function __init__() {
  const view = $dataSet?.getView('Pages', 'default');
  if (!view) return;
  
  view.events.on('currentRowChanged', (currentRow) => {
    if (currentRow) {
      $page.showMessage(`当前选中页面：${currentRow.title}`, 'info');
    }
  });
}

function handleRowChange(currentRow, oldRow) {
  // 当前行变化处理，由 r-table 的 currentChange 事件触发
  if (currentRow) {
    console.log('当前行变化至:', currentRow.id);
  }
}

function handleSelection(selection) {
  // 选中行变化处理，由 r-table 的 selectionChange 事件触发
  console.log('选中行:', selection.map(row => row.id));
}

function handleRowClick(row, column, event) {
  // 行点击处理，由 r-table 的 rowClick 事件触发
  $page.showAlert(`点击了页面：${row.title}`, 'info');
}