let _pageState = {};

function __init__() {
  // 页面初始化，可以在这里订阅数据变化
  const view = $dataSet?.getView('Users', 'default');
  if (!view) return;
  
  // 监听当前行变化
  view.events.on('currentRowChanged', (currentRow) => {
    // currentRow 就是当前行对象（或 null）
    // 这里可以执行一些当前行变化后的逻辑
    console.log('当前行变化:', currentRow);
  });
  
  // 监听选中行变化
  view.events.on('selectedRowsChanged', (selectedRows) => {
    // selectedRows 就是选中行数组
    console.log('选中行变化:', selectedRows.length);
  });
}

// 行操作渲染函数
function RenderRowActions(props) {
  // 安全获取行数据
  const row = props?.row || props?.scope?.row || props?.data?.row || null;
  if (!row) return h('span', '');
  
  const handleView = () => {
    $page.showMessage({
      type: 'info',
      message: `查看用户: ${row.name} (ID: ${row.id})`
    });
  };
  
  const handleEdit = () => {
    $page.showMessage({
      type: 'warning',
      message: `编辑用户: ${row.name}`
    });
  };
  
  const handleDelete = () => {
    $page.showConfirm({
      title: '确认删除',
      message: `确定要删除用户 ${row.name} 吗？`,
      onConfirm: () => {
        const view = $dataSet?.getView('Users', 'default');
        if (view) {
          view.deleteRowById(row.id);
          $page.showMessage({
            type: 'success',
            message: '删除成功'
          });
        }
      }
    });
  };
  
  return h('div', {
    style: {
      display: 'flex',
      gap: '8px'
    }
  }, [
    h('button', {
      onClick: handleView,
      style: {
        padding: '4px 8px',
        fontSize: '12px',
        color: '#409eff',
        backgroundColor: 'transparent',
        border: '1px solid #409eff',
        borderRadius: '4px',
        cursor: 'pointer'
      }
    }, '查看'),
    h('button', {
      onClick: handleEdit,
      style: {
        padding: '4px 8px',
        fontSize: '12px',
        color: '#e6a23c',
        backgroundColor: 'transparent',
        border: '1px solid #e6a23c',
        borderRadius: '4px',
        cursor: 'pointer'
      }
    }, '编辑'),
    h('button', {
      onClick: handleDelete,
      style: {
        padding: '4px 8px',
        fontSize: '12px',
        color: '#f56c6c',
        backgroundColor: 'transparent',
        border: '1px solid #f56c6c',
        borderRadius: '4px',
        cursor: 'pointer'
      }
    }, '删除')
  ]);
}

// 表格行点击事件处理
function handleRowClick(row, column, event) {
  console.log('行点击:', row, column);
}

// 当前行变化事件处理
function handleRowChange(currentRow, oldRow) {
  console.log('当前行变化:', currentRow, oldRow);
}

// 选中行变化事件处理
function handleSelection(selection) {
  console.log('选中行变化:', selection);
}