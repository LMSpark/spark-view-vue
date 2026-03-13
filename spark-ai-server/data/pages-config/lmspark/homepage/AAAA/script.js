function __init__() {
  const view = $dataSet?.getView('Users', 'default');
  if (view) {
    view.events.on('currentRowChanged', (row) => {
      console.log('当前行变更:', row);
    });
  }
}