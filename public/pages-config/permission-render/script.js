/**
 * 权限驱动 UI 演示 ——「改权限不改代码」
 *
 * 核心理念：
 *   后端在返回数据时附带权限快照（_perm / _modelPerm），
 *   前端渲染层直接读取权限字段控制 UI，无需修改任何前端代码。
 *
 * 本演示中"切换角色"= 模拟后端返回不同的数据+权限组合。
 * 下方所有 Render* 渲染函数是「固定的框架代码」——
 *   权限数据变了，UI 自动变；前端代码，一行不动。
 *
 * 沙箱注入: $api $route $el $query $queryAll
 *            $dataSet $rebindRules $refreshData $page
 *            SparkData h
 */

// ── 页面状态 ─────────────────────────────────────────────────────────────────
let _pageState = {
  currentUser: 'user1',
  tableData:   [],
  modelPerm:   null,
}

// ── 模拟后端响应（不同角色返回不同数据+权限快照）────────────────────────────
// 真实场景：后端鉴权模块自动把 _perm/_modelPerm 注入响应体，前端代码感知不到。
var MOCK_RESPONSES = {
  user1: {
    _modelPerm: { canAdd: false, canImport: false, canExport: false },
    rows: [
      { id: 1, name: '张***', email: 'zhang@example.com', department: '销售部',
        _perm: { canEdit: false, canDelete: false, editableFields: [] } },
      { id: 2, name: '李***', email: 'li@example.com',   department: '销售部',
        _perm: { canEdit: true,  canDelete: false, editableFields: ['email'] } },
    ]
  },
  manager: {
    _modelPerm: { canAdd: true, canImport: false, canExport: true },
    rows: [
      { id: 1, name: '张三', email: 'zhang@example.com', department: '销售部',
        _perm: { canEdit: true, canDelete: false, editableFields: ['name', 'email'] } },
      { id: 2, name: '李四', email: 'li@example.com',   department: '销售部',
        _perm: { canEdit: true, canDelete: false, editableFields: ['name', 'email'] } },
      { id: 3, name: '王五', email: 'wang@example.com', department: '市场部',
        _perm: { canEdit: true, canDelete: false, editableFields: ['name', 'email'] } },
    ]
  },
  admin: {
    _modelPerm: { canAdd: true, canImport: true, canExport: true },
    rows: [
      { id: 1, name: '张三', email: 'zhang@example.com', department: '销售部',
        _perm: { canEdit: true, canDelete: true, editableFields: ['name', 'email', 'department'] } },
      { id: 2, name: '李四', email: 'li@example.com',   department: '销售部',
        _perm: { canEdit: true, canDelete: true, editableFields: ['name', 'email', 'department'] } },
      { id: 3, name: '王五', email: 'wang@example.com', department: '市场部',
        _perm: { canEdit: true, canDelete: true, editableFields: ['name', 'email', 'department'] } },
      { id: 4, name: '赵六', email: 'zhao@example.com', department: '技术部',
        _perm: { canEdit: true, canDelete: true, editableFields: ['name', 'email', 'department'] } },
    ]
  }
}

// ── 事件处理（业务逻辑，最小化）───────────────────────────────────────────────

function handleSwitchUser(userId) {
  var resp = MOCK_RESPONSES[userId]
  if (!resp) return
  _pageState.currentUser = userId
  _pageState.tableData   = resp.rows
  _pageState.modelPerm   = resp._modelPerm
  $rebindRules()
}

function handleAdd() {
  $page.showMessage('✅ 新增（_modelPerm.canAdd = true）', 'success')
}

function handleEdit(row) {
  $page.showMessage('编辑「' + row.name + '」可修改：' + (row._perm.editableFields.join('、') || '无'), 'info')
}

function handleDelete(row) {
  $page.showConfirm('确认删除「' + row.name + '」？').then(function(ok) {
    if (ok) $page.showMessage('「' + row.name + '」已删除', 'success')
  })
}

function __init__() {
  handleSwitchUser('user1')
}

// ── Render* 渲染函数（固定框架代码；权限数据改了，UI 自动变）─────────────────

/**
 * 角色选择——切换 = 模拟后端返回不同权限数据
 */
function RenderUserSwitch() {
  var current = _pageState.currentUser
  var roles = [
    { value: 'user1',   label: '员工',   desc: '脱敏·只读' },
    { value: 'manager', label: '经理',   desc: '可编辑·不可删' },
    { value: 'admin',   label: '管理员', desc: '完整权限' },
  ]
  return h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
    roles.map(function(r) {
      var active = current === r.value
      return h('label', {
        style: 'display:flex;flex-direction:column;align-items:center;padding:8px 18px;' +
               'border-radius:8px;cursor:pointer;user-select:none;min-width:88px;' +
               'border:2px solid ' + (active ? '#409eff' : '#e4e7ed') + ';' +
               'background:' + (active ? '#ecf5ff' : '#fff') + ';' +
               'color:' + (active ? '#409eff' : '#909399') + ';transition:all .12s;',
      }, [
        h('input', {
          type: 'radio', name: 'role-switch', value: r.value,
          checked: active,
          onChange: function() { handleSwitchUser(r.value) },
          style: 'display:none;',
        }),
        h('span', { style: 'font-size:14px;font-weight:600;' }, r.label),
        h('span', { style: 'font-size:11px;margin-top:2px;' }, r.desc),
      ])
    })
  )
}

/**
 * 权限快照——实时展示"后端下发"的 _perm / _modelPerm
 * 这块内容由数据驱动，代码固定不变
 */
function RenderPermSnapshot() {
  var mp   = _pageState.modelPerm
  var rows = _pageState.tableData
  if (!mp) return h('div', { style: 'color:#c0c4cc;font-size:13px;' }, '切换角色后显示')

  var tag = function(ok, label) {
    return h('span', {
      style: 'display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;' +
             'margin:2px;border:1px solid ' + (ok ? '#b3e19d' : '#fab6b6') + ';' +
             'background:' + (ok ? '#f0f9eb' : '#fef0f0') + ';' +
             'color:' + (ok ? '#529b2e' : '#c45656') + ';',
    }, (ok ? '✓ ' : '✗ ') + label)
  }

  return h('div', { style: 'font-size:13px;' }, [
    // 模型级权限
    h('div', { style: 'color:#606266;font-size:12px;font-weight:600;margin-bottom:6px;' }, '_modelPerm'),
    h('div', { style: 'margin-bottom:12px;' }, [
      tag(mp.canAdd,    '新增'),
      tag(mp.canImport, '导入'),
      tag(mp.canExport, '导出'),
    ]),
    // 行级权限
    h('div', { style: 'color:#606266;font-size:12px;font-weight:600;margin-bottom:6px;' }, '每行 _perm'),
    ...rows.map(function(row) {
      return h('div', {
        style: 'padding:6px 8px;margin-bottom:4px;background:#fafafa;' +
               'border-radius:4px;border:1px solid #f0f2f5;',
      }, [
        h('div', { style: 'font-size:12px;font-weight:600;color:#303133;margin-bottom:3px;' },
          '#' + row.id + '  ' + row.name),
        h('div', [
          tag(row._perm.canEdit,   '编辑'),
          tag(row._perm.canDelete, '删除'),
        ]),
        row._perm.editableFields && row._perm.editableFields.length
          ? h('div', { style: 'font-size:11px;color:#909399;margin-top:2px;' },
              '可改字段：' + row._perm.editableFields.join('、'))
          : h('div', { style: 'font-size:11px;color:#c0c4cc;margin-top:2px;' }, '只读，无可编辑字段'),
      ])
    }),
  ])
}

/**
 * 操作栏——新增按钮由 _modelPerm.canAdd 控制
 * 代码固定：只改后端权限，按钮状态自动变
 */
function RenderAddButton() {
  var mp     = _pageState.modelPerm || {}
  var canAdd = mp.canAdd || false
  return h('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:10px;' }, [
    h('button', {
      disabled: !canAdd,
      onClick: canAdd ? handleAdd : null,
      style: 'padding:6px 16px;border-radius:4px;font-size:13px;' +
             'cursor:' + (canAdd ? 'pointer' : 'not-allowed') + ';' +
             'border:1px solid ' + (canAdd ? '#67c23a' : '#dcdfe6') + ';' +
             'background:' + (canAdd ? '#67c23a' : '#f5f7fa') + ';' +
             'color:' + (canAdd ? '#fff' : '#c0c4cc') + ';',
    }, '＋ 新增'),
  ])
}

/**
 * 数据表格——编辑/删除按钮完全由行的 _perm 驱动
 * 代码固定：只改后端权限数据，按钮可用性自动变
 */
function RenderTable() {
  var rows = _pageState.tableData
  if (!rows.length) {
    return h('div', { style: 'text-align:center;color:#c0c4cc;padding:32px;' }, '请选择角色')
  }

  var thS = 'padding:9px 12px;text-align:left;font-size:12px;font-weight:600;' +
            'color:#909399;background:#f5f7fa;border-bottom:1px solid #ebeef5;white-space:nowrap;'
  var tdS = 'padding:9px 12px;font-size:13px;color:#606266;border-bottom:1px solid #f0f2f5;'

  var actionBtn = function(ok, color, label, onClick) {
    return h('button', {
      disabled: !ok,
      onClick: ok ? onClick : null,
      style: 'padding:3px 10px;border-radius:3px;font-size:12px;margin-right:4px;' +
             'cursor:' + (ok ? 'pointer' : 'not-allowed') + ';' +
             'border:1px solid ' + (ok ? color : '#e4e7ed') + ';' +
             'background:' + (ok ? color : '#f5f7fa') + ';' +
             'color:' + (ok ? '#fff' : '#c0c4cc') + ';',
    }, label)
  }

  return h('table', { style: 'width:100%;border-collapse:collapse;' }, [
    h('thead', h('tr', [
      h('th', { style: thS }, 'ID'),
      h('th', { style: thS }, '姓名'),
      h('th', { style: thS }, '邮箱'),
      h('th', { style: thS }, '部门'),
      h('th', { style: thS + 'width:130px;' }, '操作'),
    ])),
    h('tbody', rows.map(function(row, i) {
      return h('tr', { style: i % 2 ? 'background:#fafafa;' : '' }, [
        h('td', { style: tdS }, row.id),
        h('td', { style: tdS }, row.name),
        h('td', { style: tdS }, row.email),
        h('td', { style: tdS }, row.department),
        h('td', { style: tdS }, [
          actionBtn(row._perm.canEdit,   '#409eff', '编辑', function() { handleEdit(row) }),
          actionBtn(row._perm.canDelete, '#f56c6c', '删除', function() { handleDelete(row) }),
        ]),
      ])
    })),
  ])
}

