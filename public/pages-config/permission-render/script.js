/**
 * 数据驱动 UI 渲染演示
 * 展示如何根据后端返回的权限字段控制 UI
 */

// 沙箱注入的全局变量: 
// - $api, $route, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData, $page

let _pageState = { currentUser: '', tableData: [], responseData: null }
let _isInitialLoad = false

/**
 * 切换用户（on.change 会将新值作为第一个参数传入，直接使用最可靠）
 */
function handleSwitchUser(newUserId) {
  console.log('[handleSwitchUser] 收到参数:', newUserId, '类型:', typeof newUserId);
  const pageData = _pageState;
  // change 事件参数是字符串时直接用；否则兜底读 pageData
  const userId = (typeof newUserId === 'string' && newUserId)
    || pageData.currentUser
    || 'user1';
  console.log('[handleSwitchUser] 最终 userId:', userId);
  pageData.currentUser  = userId;
  pageData.tableData    = [];
  pageData.responseData = null;

  const users = {
    user1: {
      _modelPerm: { canAdd: false },
      data: [
        { id: 1, name: '张***', email: 'zhang@example.com', department: '销售部', _perm: { canEdit: false, canDelete: false, editableFields: [] } },
        { id: 2, name: '李***', email: 'li@example.com',   department: '销售部', _perm: { canEdit: true,  canDelete: false, editableFields: ['email'] } }
      ]
    },
    manager: {
      _modelPerm: { canAdd: true },
      data: [
        { id: 1, name: '张三', email: 'zhang@example.com', department: '销售部', _perm: { canEdit: true, canDelete: false, editableFields: ['name','email'] } },
        { id: 2, name: '李四', email: 'li@example.com',   department: '销售部', _perm: { canEdit: true, canDelete: false, editableFields: ['name','email'] } },
        { id: 3, name: '王五', email: 'wang@example.com', department: '市场部', _perm: { canEdit: true, canDelete: false, editableFields: ['name','email'] } }
      ]
    },
    admin: {
      _modelPerm: { canAdd: true },
      data: [
        { id: 1, name: '张三', email: 'zhang@example.com', department: '销售部', _perm: { canEdit: true, canDelete: true, editableFields: ['name','email','department'] } },
        { id: 2, name: '李四', email: 'li@example.com',   department: '销售部', _perm: { canEdit: true, canDelete: true, editableFields: ['name','email','department'] } },
        { id: 3, name: '王五', email: 'wang@example.com', department: '市场部', _perm: { canEdit: true, canDelete: true, editableFields: ['name','email','department'] } },
        { id: 4, name: '赵六', email: 'zhao@example.com', department: '技术部', _perm: { canEdit: true, canDelete: true, editableFields: ['name','email','department'] } }
      ]
    }
  };

  const response = users[userId];
  console.log('[handleSwitchUser] 找到数据:', response ? `${response.data.length} 条` : '未找到');
  if (!response) {
    $page.showMessage(`未知用户: ${userId}`, 'warning');
    return;
  }
  pageData.tableData    = response.data;
  pageData.responseData = response;
  if (!_isInitialLoad) {
    $page.showMessage(`✅ 已切换到 ${userId}，可见 ${response.data.length} 条数据`);
  }
  $rebindRules();
}

/**
 * 加载数据按钮点击
 */
function handleLoadData() {
  const pageData    = _pageState;
  const currentUser = pageData.currentUser || 'user1';
  console.log('[handleLoadData] currentUser:', currentUser);
  handleSwitchUser(currentUser);
}

/**
 * 渲染权限信息
 */
function renderPermInfo(row) {
  if (!row._perm) return '无权限信息';
  
  return h('div', { style: 'font-size: 12px; color: #666;' }, [
    h('div', `编辑: ${row._perm.canEdit ? '✅' : '❌'}`),
    h('div', `删除: ${row._perm.canDelete ? '✅' : '❌'}`),
    row._perm.editableFields?.length > 0 
      ? h('div', `可编辑字段: ${row._perm.editableFields.join(', ')}`)
      : null
  ]);
}

/**
 * 渲染操作按钮（使用原生 button，避免 h('el-button') 字符串无法 resolveComponent）
 */
function renderActions(row) {
  const canEdit   = row._perm?.canEdit   ?? false;
  const canDelete = row._perm?.canDelete ?? false;

  const btnStyle = (active, color) =>
    `margin-right:6px;padding:3px 10px;border-radius:3px;font-size:12px;cursor:${active ? 'pointer' : 'not-allowed'};` +
    `border:1px solid ${active ? color : '#dcdfe6'};background:${active ? color : '#f5f7fa'};color:${active ? '#fff' : '#c0c4cc'};`;

  return h('div', [
    h('button', {
      style: btnStyle(canEdit, '#409eff'),
      disabled: !canEdit,
      onClick: canEdit ? () => handleEdit(row) : undefined
    }, '编辑'),
    h('button', {
      style: btnStyle(canDelete, '#f56c6c'),
      disabled: !canDelete,
      onClick: canDelete ? () => handleDelete(row) : undefined
    }, '删除')
  ]);
}

/**
 * 新增
 */
function handleAdd() {
  const pageData = _pageState;
  if (!pageData.responseData?._modelPerm?.canAdd) {
    $page.showMessage('无新增权限', 'warning');
    return;
  }
  
  $page.showMessage('有新增权限，可以执行新增操作');
  console.log('新增操作');
}

/**
 * 编辑
 */
function handleEdit(row) {
  if (!row._perm?.canEdit) {
    $page.showMessage('无编辑权限', 'warning');
    return;
  }
  
  $page.showMessage(`可编辑字段: ${row._perm.editableFields.join(', ')}`);
  console.log('编辑:', row);
}

/**
 * 删除
 */
function handleDelete(row) {
  if (!row._perm?.canDelete) {
    $page.showMessage('无删除权限', 'warning');
    return;
  }
  
  $page.showMessage('有删除权限，可以执行删除操作');
  console.log('删除:', row);
}

/**
 * 页面初始化 —— form-create mounted 后自动调用
 */
function __init__() {
  _isInitialLoad = true;
  handleLoadData();
  _isInitialLoad = false;
}

/**
 * 自定义组件：用户切换区（原生 radio 组，从 _pageState 读取选中状态，避免 form-create
 * 重建时把 el-radio-group 的 value 重置为 rule.json 默认值）
 */
function RenderUserSwitch() {
  const current = _pageState.currentUser || 'user1';
  const users = [
    { value: 'user1',   label: '员工（只看部分数据）' },
    { value: 'manager', label: '经理（看更多数据）'   },
    { value: 'admin',   label: '管理员（完整权限）'   },
  ];
  const labelStyle =
    'display:inline-flex;align-items:center;gap:6px;cursor:pointer;' +
    'margin-right:20px;font-size:14px;color:#606266;user-select:none;';

  return h('div', { style: 'padding:4px 0;' }, [
    h('div', { style: 'display:flex;align-items:center;flex-wrap:wrap;gap:4px;' }, [
      h('span', { style: 'font-weight:600;font-size:15px;margin-right:8px;color:#303133;' }, '用户切换'),
      ...users.map(function(u) {
        return h('label', { style: labelStyle }, [
          h('input', {
            type: 'radio',
            name: 'perm-user-switch',
            value: u.value,
            checked: current === u.value,
            onChange: function() { handleSwitchUser(u.value); },
            style: 'cursor:pointer;accent-color:#409eff;width:14px;height:14px;',
          }),
          u.label,
        ]);
      }),
      h('button', {
        style: 'margin-left:16px;padding:6px 16px;border-radius:4px;font-size:14px;' +
               'cursor:pointer;border:1px solid #409eff;background:#409eff;color:#fff;',
        onClick: handleLoadData,
      }, '加载数据'),
    ]),
  ]);
}

/**
 * 自定义组件：渲染新增按钮（使用原生元素，避免 h('el-*') 字符串不走 resolveComponent）
 */
function RenderAddButton() {
  const pageData = _pageState;
  const canAdd = pageData.responseData?._modelPerm?.canAdd ?? false;

  return h('div', { style: 'padding:14px 16px;background:#fff;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:16px;' }, [
    h('button', {
      style: `padding:7px 16px;border-radius:4px;font-size:14px;cursor:${canAdd ? 'pointer' : 'not-allowed'};` +
             `border:1px solid ${canAdd ? '#67c23a' : '#dcdfe6'};background:${canAdd ? '#67c23a' : '#f5f7fa'};color:${canAdd ? '#fff' : '#c0c4cc'};`,
      disabled: !canAdd,
      onClick: canAdd ? handleAdd : undefined
    }, `新增（模型级权限：_modelPerm.canAdd = ${canAdd}）`)
  ]);
}

/**
 * 自定义组件：渲染数据表格（使用原生 table，避免 h('el-table') 字符串不走 resolveComponent）
 */
function RenderTable() {
  const pageData  = _pageState;
  const tableData = pageData.tableData || [];

  const wrapStyle = 'margin-top:16px;background:#fff;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden;';
  const thStyle   = 'padding:11px 12px;text-align:left;font-weight:600;font-size:13px;color:#606266;background:#f5f7fa;border-bottom:1px solid #ebeef5;';
  const tdStyle   = 'padding:10px 12px;font-size:13px;color:#606266;border-bottom:1px solid #ebeef5;vertical-align:middle;';

  const cols = [
    { prop: 'id',         label: 'ID',   width: '60px'  },
    { prop: 'name',       label: '姓名', width: '100px' },
    { prop: 'email',      label: '邮箱', width: '180px' },
    { prop: 'department', label: '部门', width: '100px' },
  ];

  if (tableData.length === 0) {
    return h('div', { style: wrapStyle + 'padding:24px;text-align:center;color:#909399;' }, '暂无数据，请点击「加载数据」');
  }

  return h('div', { style: wrapStyle }, [
    h('table', { style: 'width:100%;border-collapse:collapse;' }, [
      h('thead', [
        h('tr', [
          ...cols.map(c => h('th', { style: thStyle + `width:${c.width};` }, c.label)),
          h('th', { style: thStyle }, '权限信息'),
          h('th', { style: thStyle + 'width:160px;' }, '操作'),
        ])
      ]),
      h('tbody', tableData.map((row, i) =>
        h('tr', { style: i % 2 === 0 ? '' : 'background:#fafafa;' }, [
          ...cols.map(c => h('td', { style: tdStyle }, String(row[c.prop] ?? ''))),
          h('td', { style: tdStyle }, [renderPermInfo(row)]),
          h('td', { style: tdStyle }, [renderActions(row)]),
        ])
      ))
    ])
  ]);
}
