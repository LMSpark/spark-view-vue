let _pageState = {
  permissionFilter: {
    role: '',
    dept: '',
    dataScope: ''
  },
  allRows: []
};

function __init__() {
  const view = getPermissionView();
  if (!view) {
    return;
  }

  _pageState.permissionFilter = {
    role: '',
    dept: '',
    dataScope: ''
  };
  _pageState.allRows = cloneRows(view.rows);

  view.events.on('rowsChanged', handleRowsChanged);
  view.events.on('currentRowChanged', handleCurrentRowChanged);
}

function getPermissionView() {
  return $dataSet ? $dataSet.getView('PermissionData', 'default') : null;
}

function cloneRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map(function(row) {
    return Object.assign({}, row);
  });
}

function hasActiveFilters() {
  const filter = _pageState.permissionFilter;
  return Boolean(filter.role || filter.dept || filter.dataScope);
}

function getSourceRows(view) {
  if (Array.isArray(_pageState.allRows) && _pageState.allRows.length > 0) {
    return cloneRows(_pageState.allRows);
  }
  return cloneRows(view ? view.rows : []);
}

function getSelectedRows(view) {
  if (!view) {
    return [];
  }
  if (Array.isArray(view.selectedRows)) {
    return view.selectedRows;
  }
  if (view.selection && Array.isArray(view.selection.selectedRows)) {
    return view.selection.selectedRows;
  }
  return [];
}

function syncCurrentRow(view, rows, originatorId) {
  if (!view || !view.selection || typeof view.selection.setCurrentRowById !== 'function') {
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }
  view.selection.setCurrentRowById(rows[0].id, originatorId || 'vxe-demo');
}

function applyPermissionFilter(options) {
  const view = getPermissionView();
  if (!view) {
    return;
  }

  const filter = _pageState.permissionFilter;
  const sourceRows = getSourceRows(view);
  const filteredRows = sourceRows.filter(function(row) {
    if (filter.role && row.role !== filter.role) {
      return false;
    }
    if (filter.dept && String(row.deptId) !== String(filter.dept)) {
      return false;
    }
    if (filter.dataScope && row.dataScope !== filter.dataScope) {
      return false;
    }
    return true;
  });

  view.replaceRows(filteredRows);
  syncCurrentRow(view, filteredRows, 'permission-filter');

  if (options && options.silent) {
    return;
  }

  if (hasActiveFilters()) {
    $page.showMessage('已过滤出 ' + filteredRows.length + ' 条数据', 'success');
    return;
  }

  $page.showMessage('已恢复全部 ' + filteredRows.length + ' 条数据', 'info');
}

function resetPermissionFilter() {
  _pageState.permissionFilter = {
    role: '',
    dept: '',
    dataScope: ''
  };
  applyPermissionFilter();
}

function handleRoleChange(value) {
  _pageState.permissionFilter.role = value || '';
  applyPermissionFilter();
}

function handleDeptChange(value) {
  _pageState.permissionFilter.dept = value || '';
  applyPermissionFilter();
}

function handleDataScopeChange(value) {
  _pageState.permissionFilter.dataScope = value || '';
  applyPermissionFilter();
}

function handleCurrentChange(currentRow) {
  if (currentRow) {
    console.log('当前选中：' + currentRow.name);
  }
}

function handleSelectionChange(selectedRows) {
  const rows = Array.isArray(selectedRows) ? selectedRows : [];
  console.log('已选择 ' + rows.length + ' 条数据');
}

function handleRowsChanged() {
  const view = getPermissionView();
  if (!view) {
    return;
  }

  if (!hasActiveFilters()) {
    _pageState.allRows = cloneRows(view.rows);
  }

  console.log('数据行数变化：' + view.rows.length);
}

function handleCurrentRowChanged(currentRow) {
  if (currentRow) {
    console.log('当前行更新：' + currentRow.name);
  }
}

function buildFilterSummary() {
  const filter = _pageState.permissionFilter;
  const parts = [];

  if (filter.role) {
    parts.push('角色=' + filter.role);
  }
  if (filter.dept) {
    parts.push('部门=' + filter.dept);
  }
  if (filter.dataScope) {
    parts.push('范围=' + filter.dataScope);
  }

  if (parts.length === 0) {
    return '当前过滤：全部数据';
  }

  return '当前过滤：' + parts.join(' / ');
}

function RenderPermissionFilter() {
  return h('div', { class: 'permission-filter-summary' }, [
    h('span', { class: 'filter-summary-text' }, buildFilterSummary()),
    h('button', {
      class: 'filter-reset-btn',
      type: 'button',
      onClick: resetPermissionFilter
    }, '重置')
  ]);
}

function RenderFilterControls() {
  const filter = _pageState.permissionFilter;
  const roleOptions = [
    { label: '全部角色', value: '' },
    { label: '管理员', value: 'admin' },
    { label: '部门经理', value: 'manager' },
    { label: '普通员工', value: 'employee' }
  ];
  const deptOptions = [
    { label: '全部部门', value: '' },
    { label: '研发部', value: '101' },
    { label: '产品部', value: '102' },
    { label: '测试部', value: '103' }
  ];
  const scopeOptions = [
    { label: '全部范围', value: '' },
    { label: '全部数据', value: 'all' },
    { label: '本部门及下属', value: 'deptAndSub' },
    { label: '仅本部门', value: 'deptOnly' },
    { label: '仅自己', value: 'self' }
  ];

  function renderSelect(label, value, options, onChange) {
    return h('label', { class: 'filter-control' }, [
      h('span', { class: 'filter-label' }, label),
      h('select', {
        class: 'filter-select',
        value: value,
        onChange: function(event) {
          const nextValue = event && event.target ? event.target.value : '';
          onChange(nextValue);
        }
      }, options.map(function(option) {
        return h('option', { value: option.value }, option.label);
      }))
    ]);
  }

  return h('div', { class: 'filter-controls' }, [
    renderSelect('角色', filter.role, roleOptions, handleRoleChange),
    renderSelect('部门', filter.dept, deptOptions, handleDeptChange),
    renderSelect('数据范围', filter.dataScope, scopeOptions, handleDataScopeChange)
  ]);
}

function RenderTableToolbar() {
  return h('div', { class: 'toolbar-actions' }, [
    h('button', {
      class: 'toolbar-button toolbar-button-primary',
      type: 'button',
      onClick: function() {
        $page.showMessage('示例页暂未接入新增表单', 'info');
      }
    }, '新增'),
    h('button', {
      class: 'toolbar-button toolbar-button-warning',
      type: 'button',
      onClick: function() {
        const selectedRows = getSelectedRows(getPermissionView());
        if (selectedRows.length === 0) {
          $page.showMessage('请先选择数据', 'warning');
          return;
        }
        $page.showMessage('已选择 ' + selectedRows.length + ' 条数据，批量操作待接入', 'success');
      }
    }, '批量操作'),
    h('button', {
      class: 'toolbar-button toolbar-button-muted',
      type: 'button',
      onClick: function() {
        applyPermissionFilter({ silent: false });
      }
    }, '刷新数据')
  ]);
}

function RenderActions(props) {
  const row = props && props.row ? props.row : null;
  if (!row) {
    return null;
  }

  return h('div', { class: 'row-actions' }, [
    h('button', {
      class: 'row-action-button row-action-view',
      type: 'button',
      onClick: function() {
        const view = getPermissionView();
        syncCurrentRow(view, [row], 'RenderActions');
        $page.showMessage('查看详情：' + row.name, 'info');
      }
    }, '查看'),
    h('button', {
      class: 'row-action-button row-action-edit',
      type: 'button',
      onClick: function() {
        const view = getPermissionView();
        syncCurrentRow(view, [row], 'RenderActions');
        $page.showMessage('编辑功能待实现：' + row.name, 'info');
      }
    }, '编辑'),
    h('button', {
      class: 'row-action-button row-action-delete',
      type: 'button',
      onClick: function() {
        $page.showConfirm('确认删除「' + row.name + '」？', '删除确认').then(function(ok) {
          if (!ok) {
            return;
          }

          _pageState.allRows = getSourceRows(getPermissionView()).filter(function(item) {
            return item.id !== row.id;
          });
          applyPermissionFilter({ silent: true });
          $page.showMessage('删除成功', 'success');
        });
      }
    }, '删除')
  ]);
}