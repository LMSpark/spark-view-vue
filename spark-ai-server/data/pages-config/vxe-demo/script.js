function __init__() {
  // 初始化页面状态
  _pageState = {
    filterActive: false,
    selectedCount: 0,
    filterValues: {
      name: '',
      deptName: '',
      status: ''
    }
  };

  // 获取数据视图
  const view = $dataSet.getView('PermissionData', 'default');

  // 监听当前行变化，更新详情面板
  view.events.on('currentRowChanged', (currentRow) => {
    if (currentRow) {
      $page.showMessage({
        message: `已选中：${currentRow.name} (${currentRow.deptName})`,
        type: 'success',
        duration: 1500
      });
    }
  });

  // 监听选中行变化，更新选中计数
  view.events.on('selectedRowsChanged', (selectedRows) => {
    _pageState.selectedCount = selectedRows.length;
    // 触发 UI 更新（例如 RenderFilterBar 会读取 _pageState）
  });

  // 监听行数据变化，刷新表格
  view.events.on('rowsChanged', () => {
    // 可以在这里执行一些数据变化后的逻辑，例如更新统计
    console.log('数据已更新，当前行数：', view.rows.length);
  });
}

// 页面级状态变量
let _pageState = {};

// 渲染过滤栏
function RenderFilterBar() {
  // 使用原生 HTML 标签创建过滤栏
  return h('div', { class: 'filter-bar' }, [
    h('div', { class: 'filter-item' }, [
      h('span', { class: 'filter-label' }, '姓名：'),
      h('input', {
        class: 'filter-input',
        type: 'text',
        placeholder: '输入姓名',
        value: _pageState.filterValues.name,
        onInput: (e) => {
          _pageState.filterValues.name = e.target.value;
        }
      })
    ]),
    h('div', { class: 'filter-item' }, [
      h('span', { class: 'filter-label' }, '部门：'),
      h('select', {
        class: 'filter-select',
        value: _pageState.filterValues.deptName,
        onChange: (e) => {
          _pageState.filterValues.deptName = e.target.value;
        }
      }, [
        h('option', { value: '' }, '全部'),
        h('option', { value: '研发部' }, '研发部'),
        h('option', { value: '产品部' }, '产品部'),
        h('option', { value: '测试部' }, '测试部')
      ])
    ]),
    h('div', { class: 'filter-item' }, [
      h('span', { class: 'filter-label' }, '状态：'),
      h('select', {
        class: 'filter-select',
        value: _pageState.filterValues.status,
        onChange: (e) => {
          _pageState.filterValues.status = e.target.value;
        }
      }, [
        h('option', { value: '' }, '全部'),
        h('option', { value: '在岗' }, '在岗'),
        h('option', { value: '休假' }, '休假'),
        h('option', { value: '离职' }, '离职')
      ])
    ]),
    h('div', { class: 'filter-button' }, [
      h('button', {
        onClick: handleFilterApply
      }, '筛选'),
      h('button', {
        style: { marginLeft: '8px' },
        onClick: handleFilterReset
      }, '重置')
    ])
  ]);
}

// 应用筛选
function handleFilterApply() {
  const view = $dataSet.getView('PermissionData', 'default');
  const { name, deptName, status } = _pageState.filterValues;
  const filteredRows = view.rows.filter(row => {
    return (!name || row.name.includes(name)) &&
           (!deptName || row.deptName === deptName) &&
           (!status || row.status === status);
  });
  view.replaceRows(filteredRows);
  _pageState.filterActive = true;
  $page.showMessage({
    message: `筛选完成，显示 ${filteredRows.length} 条数据`,
    type: 'info',
    duration: 2000
  });
}

// 重置筛选
function handleFilterReset() {
  const view = $dataSet.getView('PermissionData', 'default');
  _pageState.filterValues = { name: '', deptName: '', status: '' };
  // 恢复原始数据：从 pagedata.json 重新加载
  const originalRows = $dataSet.getTable('PermissionData').views.default.rows;
  view.replaceRows(originalRows);
  _pageState.filterActive = false;
  $page.showMessage({
    message: '筛选已重置',
    type: 'success',
    duration: 1500
  });
}