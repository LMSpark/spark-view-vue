/**
 * 数据驱动 UI 渲染演示
 * 展示如何根据后端返回的权限字段控制 UI
 */

// 沙箱注入的全局变量: 
// - $api, $route, $data, $el, $query, $queryAll, $dataSet, $rebindRules, $refreshData
// - ElMessage, ElMessageBox, SparkData, h

// 模拟后端返回的数据（已包含权限字段）
const mockBackendData = {
  user1: {
    _modelPerm: { canAdd: false },
    data: [
      {
        id: 1,
        name: '张***',
        email: 'zhang@example.com',
        department: '销售部',
        _perm: { canEdit: false, canDelete: false, editableFields: [] }
      },
      {
        id: 2,
        name: '李***',
        email: 'li@example.com',
        department: '销售部',
        _perm: { canEdit: true, canDelete: false, editableFields: ['email'] }
      }
    ]
  },
  manager: {
    _modelPerm: { canAdd: true },
    data: [
      {
        id: 1,
        name: '张三',
        email: 'zhang@example.com',
        department: '销售部',
        _perm: { canEdit: true, canDelete: false, editableFields: ['name', 'email'] }
      },
      {
        id: 2,
        name: '李四',
        email: 'li@example.com',
        department: '销售部',
        _perm: { canEdit: true, canDelete: false, editableFields: ['name', 'email'] }
      },
      {
        id: 3,
        name: '王五',
        email: 'wang@example.com',
        department: '市场部',
        _perm: { canEdit: true, canDelete: false, editableFields: ['name', 'email'] }
      }
    ]
  },
  admin: {
    _modelPerm: { canAdd: true },
    data: [
      {
        id: 1,
        name: '张三',
        email: 'zhang@example.com',
        department: '销售部',
        _perm: { canEdit: true, canDelete: true, editableFields: ['name', 'email', 'department'] }
      },
      {
        id: 2,
        name: '李四',
        email: 'li@example.com',
        department: '销售部',
        _perm: { canEdit: true, canDelete: true, editableFields: ['name', 'email', 'department'] }
      },
      {
        id: 3,
        name: '王五',
        email: 'wang@example.com',
        department: '市场部',
        _perm: { canEdit: true, canDelete: true, editableFields: ['name', 'email', 'department'] }
      },
      {
        id: 4,
        name: '赵六',
        email: 'zhao@example.com',
        department: '技术部',
        _perm: { canEdit: true, canDelete: true, editableFields: ['name', 'email', 'department'] }
      }
    ]
  }
};

/**
 * 切换用户
 */
function handleSwitchUser(userId) {
  const pageData = $data;
  pageData.currentUser = userId;
  pageData.tableData = [];
  pageData.responseData = null;
  
  ElMessage.info(`已切换到：${userId}`);
}

/**
 * 加载数据（模拟后端返回）
 */
function handleLoadData() {
  const pageData = $data;
  const currentUser = pageData.currentUser || 'user1';
  
  // 模拟网络延迟
  setTimeout(() => {
    const response = mockBackendData[currentUser];
    
    pageData.tableData = response.data;
    pageData.responseData = response;
    
    ElMessage.success(`✅ 加载成功！可见 ${response.data.length} 条数据`);
    console.log('后端返回数据：', response);
  }, 300);
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
 * 渲染操作按钮
 */
function renderActions(row) {
  const buttons = [];
  
  if (row._perm?.canEdit) {
    buttons.push(
      h('el-button', {
        size: 'small',
        type: 'primary',
        onClick: () => handleEdit(row)
      }, '编辑')
    );
  } else {
    buttons.push(
      h('el-button', {
        size: 'small',
        disabled: true
      }, '编辑')
    );
  }
  
  if (row._perm?.canDelete) {
    buttons.push(
      h('el-button', {
        size: 'small',
        type: 'danger',
        onClick: () => handleDelete(row)
      }, '删除')
    );
  } else {
    buttons.push(
      h('el-button', {
        size: 'small',
        disabled: true
      }, '删除')
    );
  }
  
  return h('div', buttons);
}

/**
 * 新增
 */
function handleAdd() {
  const pageData = $data;
  if (!pageData.responseData?._modelPerm?.canAdd) {
    ElMessage.warning('无新增权限');
    return;
  }
  
  ElMessage.success('有新增权限，可以执行新增操作');
  console.log('新增操作');
}

/**
 * 编辑
 */
function handleEdit(row) {
  if (!row._perm?.canEdit) {
    ElMessage.warning('无编辑权限');
    return;
  }
  
  ElMessage.success(`可编辑字段: ${row._perm.editableFields.join(', ')}`);
  console.log('编辑:', row);
}

/**
 * 删除
 */
function handleDelete(row) {
  if (!row._perm?.canDelete) {
    ElMessage.warning('无删除权限');
    return;
  }
  
  ElMessage.success('有删除权限，可以执行删除操作');
  console.log('删除:', row);
}

/**
 * 自定义组件：渲染新增按钮
 */
function RenderAddButton() {
  const pageData = $data;
  const canAdd = pageData.responseData?._modelPerm?.canAdd ?? false;
  
  return h('el-card', null, [
    h('div', { style: 'margin-bottom: 10px' }, [
      h('el-button', {
        type: 'success',
        disabled: !canAdd,
        onClick: handleAdd
      }, `新增（模型级权限：_modelPerm.canAdd = ${canAdd}）`)
    ])
  ]);
}

/**
 * 自定义组件：渲染数据表格
 */
function RenderTable() {
  const pageData = $data;
  const tableData = pageData.tableData || [];
  
  return h('el-card', { style: 'margin-top: 20px' }, [
    h('el-table', {
      data: tableData,
      border: true
    }, {
      default: () => [
        h('el-table-column', { prop: 'id', label: 'ID', width: 80 }),
        h('el-table-column', { prop: 'name', label: '姓名', width: 120 }),
        h('el-table-column', { prop: 'email', label: '邮箱', width: 200 }),
        h('el-table-column', { prop: 'department', label: '部门', width: 120 }),
        h('el-table-column', {
          label: '权限信息',
          width: 300
        }, {
          default: ({ row }) => renderPermInfo(row)
        }),
        h('el-table-column', {
          label: '操作',
          width: 200
        }, {
          default: ({ row }) => renderActions(row)
        })
      ]
    })
  ]);
}
