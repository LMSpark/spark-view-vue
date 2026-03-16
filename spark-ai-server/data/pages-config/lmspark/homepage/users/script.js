let _pageState = {};

function __init__() {
  const view = $dataSet?.getView('users', 'default');
  if (!view) {
    console.warn('users 视图未找到');
    return;
  }
  
  // 初始化页面状态
  _pageState.editDialogVisible = false;
  _pageState.searchKeyword = '';
  
  console.log('👥 用户管理页面初始化完成，数据行数:', view.rows.length);
  
  view.events.on('currentRowChanged', (currentRow) => {
    console.log('当前行变更:', currentRow);
  });
  
  view.events.on('selectedRowsChanged', (selectedRows) => {
    console.log('选中行变更:', selectedRows);
  });
}

function handleRowChange(currentRow, oldRow) {
  console.log('表格当前行变更:', currentRow, '旧行:', oldRow);
}

function handleSelection(selection) {
  console.log('表格选中行变更:', selection);
}

function formatDepartment(row, column, cellValue, index) {
  // 部门格式化函数
  return cellValue || '—';
}

function handleSearchInput(value) {
  _pageState.searchKeyword = value;
  console.log('搜索关键词:', value);
  
  const view = $dataSet?.getView('users', 'default');
  if (!view) return;
  
  if (!value) {
    // 清空搜索，恢复所有数据
    view.replaceRows(view.originalRows || view.rows);
    return;
  }
  
  // 保存原始数据（第一次搜索时）
  if (!view.originalRows) {
    view.originalRows = [...view.rows];
  }
  
  const keyword = value.toLowerCase();
  const filteredRows = view.originalRows.filter(row => 
    row.name.toLowerCase().includes(keyword) || 
    (row.department && row.department.toLowerCase().includes(keyword))
  );
  
  view.replaceRows(filteredRows);
}

function handleCloseEditDialog() {
  _pageState.editDialogVisible = false;
}

function RenderToolbarButtons() {
  return h('div', {
    style: { display: 'flex', gap: '8px' }
  }, [
    h('button', {
      class: 'el-button el-button--primary',
      onClick: () => {
        const view = $dataSet?.getView('users', 'default');
        if (!view) return;
        
        // 创建新用户
        const newId = Math.max(...view.rows.map(r => r.id), 0) + 1;
        const newUser = {
          id: newId,
          name: '新用户',
          gender: 'male',
          department: '',
          age: 25,
          role: 'user',
          status: 'active'
        };
        
        view.appendRow(newUser);
        view.selection.setCurrentRowById(newId, 'toolbar-add');
        
        // 打开编辑对话框
        _pageState.editDialogVisible = true;
        
        $page.showMessage({
          message: '已创建新用户，请填写详细信息',
          type: 'success'
        });
      }
    }, '新增用户'),
    
    h('button', {
      class: 'el-button el-button--danger',
      onClick: () => {
        const view = $dataSet?.getView('users', 'default');
        if (!view) return;
        
        const selectedRows = view.selection.selectedRows;
        if (selectedRows.length === 0) {
          $page.showMessage({
            message: '请先选择要删除的用户',
            type: 'warning'
          });
          return;
        }
        
        $page.showConfirm({
          title: '确认删除',
          message: `确定要删除选中的 ${selectedRows.length} 个用户吗？`,
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
          onConfirm: () => {
            selectedRows.forEach(row => {
              view.deleteRowById(row.id);
            });
            
            $page.showMessage({
              message: `已删除 ${selectedRows.length} 个用户`,
              type: 'success'
            });
          }
        });
      }
    }, '删除选中')
  ]);
}

function RenderRowActionsWithStatus(props) {
  const row = props.row;
  const status = row.status || 'active';
  const statusText = status === 'active' ? '启用' : '禁用';
  const statusClass = status === 'active' ? 'status-active' : 'status-inactive';
  
  return h('div', {
    class: 'row-actions-with-status'
  }, [
    h('span', {
      class: `status-badge ${statusClass}`
    }, statusText),
    
    h('button', {
      class: 'el-button el-button--primary el-button--small',
      onClick: () => {
        const view = $dataSet?.getView('users', 'default');
        if (!view) return;
        
        // 设置当前行并打开编辑对话框
        view.selection.setCurrentRowById(row.id, 'row-edit');
        _pageState.editDialogVisible = true;
      }
    }, '编辑'),
    
    h('button', {
      class: 'el-button el-button--danger el-button--small',
      onClick: () => {
        $page.showConfirm({
          title: '确认删除',
          message: `确定要删除用户 "${row.name}" 吗？`,
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
          onConfirm: () => {
            const view = $dataSet?.getView('users', 'default');
            if (!view) return;
            
            view.deleteRowById(row.id);
            
            $page.showMessage({
              message: `用户 "${row.name}" 已删除`,
              type: 'success'
            });
          }
        });
      }
    }, '删除')
  ]);
}