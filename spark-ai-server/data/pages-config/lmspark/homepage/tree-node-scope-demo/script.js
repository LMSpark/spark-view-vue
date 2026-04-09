let _pageState = {};

function __init__() {
  const view = $dataSet?.getView('TreeData', 'default');
  if (!view) return;
  
  view.events.on('currentRowChanged', (currentRow) => {
    if (currentRow) {
      $page.showMessage({
        message: `选中节点: ${currentRow.name} (ID: ${currentRow.id})`,
        type: 'info',
        duration: 2000
      });
    }
  });
}

function handleNodeClick(nodeData, node, treeNode) {
  const view = $dataSet?.getView('TreeData', 'default');
  if (view && nodeData) {
    view.selection.setCurrentRowById(nodeData.id, 'tree-node-click');
  }
}

function handleNodeExpand(nodeData, node, treeNode) {
  $page.showMessage({
    message: `展开节点: ${nodeData.name}`,
    type: 'success',
    duration: 1500
  });
}

function handleNodeCollapse(nodeData, node, treeNode) {
  $page.showMessage({
    message: `折叠节点: ${nodeData.name}`,
    type: 'warning',
    duration: 1500
  });
}

function RenderRefreshButton(props) {
  return h('button', {
    style: {
      padding: '8px 16px',
      backgroundColor: '#409eff',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px'
    },
    onClick: () => {
      $refreshData();
      $page.showMessage({ message: '数据已刷新', type: 'success', duration: 1500 });
    }
  }, '刷新数据');
}

function RenderTreeToolbar(props) {
  return h('div', {
    style: {
      display: 'flex',
      gap: '10px',
      marginBottom: '10px'
    }
  }, [
    h('button', {
      style: {
        padding: '6px 12px',
        backgroundColor: '#67c23a',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px'
      },
      onClick: () => {
        $page.showMessage({ message: '添加节点功能待实现', type: 'info', duration: 1500 });
      }
    }, '添加节点'),
    h('button', {
      style: {
        padding: '6px 12px',
        backgroundColor: '#f56c6c',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px'
      },
      onClick: () => {
        const view = $dataSet?.getView('TreeData', 'default');
        if (view?.currentRow) {
          $page.showConfirm({
            title: '确认删除',
            message: `确定删除节点“${view.currentRow.name}”吗？`,
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            type: 'warning',
            onConfirm: () => {
              view.deleteRowById(view.currentRow.id);
              $page.showMessage({ message: '节点已删除', type: 'success', duration: 1500 });
            }
          });
        } else {
          $page.showMessage({ message: '请先选择一个节点', type: 'warning', duration: 1500 });
        }
      }
    }, '删除节点')
  ]);
}