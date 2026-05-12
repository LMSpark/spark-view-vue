// ════════════════════════════════════════════════════════
// 用户管理 — 完整 CRUD 交互逻辑
// ════════════════════════════════════════════════════════

function __init__() {
  var view = $dataSet?.getView('Users', 'default');
  if (!view) return;

  view.events.on('currentRowChanged', function(currentRow) {
    if (currentRow) {
      console.log('[USER_MGMT] 当前用户 →', currentRow.name, '(ID:', currentRow.id, ')');
    }
  });

  view.events.on('selectedRowsChanged', function(selectedRows) {
    console.log('[USER_MGMT] 选中:', selectedRows.length, '条');
  });
}

// ── 对话框控制 ──

function openAddDialog() {
  var dialogApi = $components.getApi('dialog-add-user');
  if (dialogApi) {
    // 重置表单
    var formApi = $components.getApi('form-add-user');
    if (formApi && formApi.resetFields) {
      formApi.resetFields();
    }
    dialogApi.open();
  }
}

function cancelAddUser() {
  var dialogApi = $components.getApi('dialog-add-user');
  if (dialogApi) dialogApi.close();
}

function confirmAddUser() {
  var formApi = $components.getApi('form-add-user');
  if (!formApi) return;

  var formData = formApi.getFormData();
  if (!formData || !formData.name) {
    $page.showMessage({ type: 'warning', message: '⚠ 请填写用户姓名' });
    return;
  }

  var view = $dataSet?.getView('Users', 'default');
  if (!view) return;

  // 生成新 ID
  var rows = view.rows || [];
  var maxId = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id > maxId) maxId = rows[i].id;
  }

  var newRow = {
    id: maxId + 1,
    name: formData.name || '',
    gender: formData.gender || 'male',
    age: formData.age || 0,
    joinDate: formData.joinDate || '',
    department: formData.department || 'tech',
    active: formData.active !== undefined ? formData.active : true
  };

  view.appendRow(newRow);
  $page.showMessage({ type: 'success', message: '✓ 用户 ' + newRow.name + ' 新增成功' });

  var dialogApi = $components.getApi('dialog-add-user');
  if (dialogApi) dialogApi.close();
}

// ── 编辑用户 ──

function openEditDialog() {
  var view = $dataSet?.getView('Users', 'default');
  if (!view || !view.currentRow) {
    $page.showMessage({ type: 'warning', message: '⚠ 请先选择要编辑的用户行' });
    return;
  }

  var dialogApi = $components.getApi('dialog-edit-user');
  if (dialogApi) {
    // 表单已绑定 Users@currentRow，自动填充当前行数据
    dialogApi.open();
  }
}

function cancelEditUser() {
  var dialogApi = $components.getApi('dialog-edit-user');
  if (dialogApi) dialogApi.close();
}

function confirmEditUser() {
  var view = $dataSet?.getView('Users', 'default');
  if (!view || !view.currentRow) {
    $page.showMessage({ type: 'warning', message: '⚠ 未选中用户' });
    return;
  }

  var formApi = $components.getApi('form-edit-user');
  if (!formApi) return;

  var formData = formApi.getFormData();
  if (!formData || !formData.name) {
    $page.showMessage({ type: 'warning', message: '⚠ 请填写用户姓名' });
    return;
  }

  var updated = view.updateRowById(view.currentRow.id, {
    name: formData.name,
    gender: formData.gender,
    age: formData.age,
    joinDate: formData.joinDate,
    department: formData.department,
    active: formData.active
  });

  if (updated) {
    $page.showMessage({ type: 'success', message: '✓ 用户 ' + formData.name + ' 更新成功' });
  } else {
    $page.showMessage({ type: 'error', message: '⚠ 更新失败' });
  }

  var dialogApi = $components.getApi('dialog-edit-user');
  if (dialogApi) dialogApi.close();
}

// ── 删除用户 ──

function deleteRow() {
  var view = $dataSet?.getView('Users', 'default');
  if (!view || !view.currentRow) {
    $page.showMessage({ type: 'warning', message: '⚠ 请先选择要删除的用户行' });
    return;
  }

  var row = view.currentRow;
  $page.showConfirm({
    title: '⚠ 确认删除',
    message: '确定要删除用户「' + row.name + '」吗？此操作不可恢复。',
    onConfirm: function() {
      view.deleteRowById(row.id);
      $page.showMessage({ type: 'success', message: '✓ 用户 ' + row.name + ' 已删除' });
    }
  });
}

function deleteSelected() {
  var view = $dataSet?.getView('Users', 'default');
  if (!view) return;

  var selected = view.selectedRows || [];
  if (selected.length === 0) {
    $page.showMessage({ type: 'warning', message: '⚠ 请先勾选要删除的用户' });
    return;
  }

  var names = [];
  for (var i = 0; i < selected.length; i++) {
    names.push(selected[i].name);
  }

  $page.showConfirm({
    title: '⚠ 批量删除',
    message: '确定要删除选中的 ' + selected.length + ' 个用户（' + names.join('、') + '）吗？',
    onConfirm: function() {
      for (var j = 0; j < selected.length; j++) {
        view.deleteRowById(selected[j].id);
      }
      $page.showMessage({ type: 'success', message: '✓ 已删除 ' + selected.length + ' 个用户' });
    }
  });
}

// ── 刷新 ──

function refresh() {
  var view = $dataSet?.getView('Users', 'default');
  if (view && view.refresh) {
    view.refresh();
    $page.showMessage({ type: 'success', message: '↻ 数据已刷新' });
  }
}

// ── 行操作渲染：状态切换 ──

function RenderStatusAction(props) {
  var row = props?.row || props?.scope?.row || props?.data?.row || null;
  if (!row) return h('span', '');

  var isActive = Boolean(row.active);
  var nextActive = !isActive;
  var label = isActive ? '⏻ 禁用' : '⏼ 启用';

  var handleToggle = function() {
    var view = $dataSet?.getView('Users', 'default');
    if (!view) return;

    var updated = view.updateRowById(row.id, { active: nextActive });
    if (!updated) {
      $page.showMessage({ type: 'error', message: '⚠ 状态更新失败' });
      return;
    }
    $page.showMessage({
      type: 'success',
      message: '✓ ' + row.name + ' → ' + (nextActive ? '已启用' : '已禁用')
    });
  };

  return h('button', {
    onClick: handleToggle,
    style: {
      padding: '3px 10px',
      fontSize: '11px',
      fontFamily: 'Courier New, monospace',
      letterSpacing: '1px',
      color: nextActive ? '#00ffaa' : '#ff6b9d',
      backgroundColor: nextActive ? 'rgba(0,255,170,0.08)' : 'rgba(255,107,157,0.08)',
      border: '1px solid ' + (nextActive ? 'rgba(0,255,170,0.4)' : 'rgba(255,107,157,0.4)'),
      borderRadius: '4px',
      cursor: 'pointer',
      textShadow: '0 0 8px ' + (nextActive ? 'rgba(0,255,170,0.5)' : 'rgba(255,107,157,0.5)'),
      transition: 'all 0.3s ease',
    }
  }, label);
}

// ── 行点击事件 ──
function handleRowClick(row, column, event) {
  console.log('[USER_MGMT] 行点击 ::', row?.name);
}

function handleRowChange(currentRow, oldRow) {
  console.log('[USER_MGMT] 切换 ::', oldRow?.name, '→', currentRow?.name);
}

function handleSelection(selection) {
  console.log('[USER_MGMT] 选中 ::', selection?.length, '条');
}
