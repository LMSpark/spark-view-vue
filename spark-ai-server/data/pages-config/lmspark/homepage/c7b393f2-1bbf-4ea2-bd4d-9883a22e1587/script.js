// 请假管理系统 - 页面脚本
function __init__() {
  console.log('[请假管理] 页面已加载')
  refreshStats()
}

// ========== 统计刷新 ==========
function refreshStats() {
  const rows = $page.getTableData('LeaveRequests') || []
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()
  
  const monthRows = rows.filter(r => {
    const d = new Date(r.createdAt || r.startDate)
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear
  })
  
  const pendingCount = rows.filter(r => r.status === 'pending').length
  const approvedCount = monthRows.filter(r => r.status === 'approved').length
  const rejectedCount = monthRows.filter(r => r.status === 'rejected').length
  const totalCount = monthRows.length
  
  $page.setFieldValue('stats-pending-count', pendingCount)
  $page.setFieldValue('stats-approved-count', approvedCount)
  $page.setFieldValue('stats-rejected-count', rejectedCount)
  $page.setFieldValue('stats-total-count', totalCount)
}

// ========== 新增请假 ==========
function onBtnAddClick() {
  // 打开弹窗，清空表单
  $page.showDialog('leave-form-dialog')
  $page.clearForm('leave-form')
}

// ========== 查看详情 ==========
function onActionViewClick(row) {
  const msg = [
    `申请人：${row.employeeName}`,
    `部门：${row.department}`,
    `假期类型：${getLeaveTypeName(row.leaveTypeId)}`,
    `开始日期：${row.startDate}`,
    `结束日期：${row.endDate}`,
    `天数：${row.totalDays}`,
    `状态：${getStatusLabel(row.status)}`,
    `请假原因：${row.reason || '无'}`,
    `审批人：${row.approver || '无'}`,
    `审批意见：${row.comment || '无'}`
  ].join('\n')
  $page.showMessage(msg, 'info')
}

// ========== 编辑请假 ==========
function onActionEditClick(row) {
  $page.showDialog('leave-form-dialog')
  $page.setFormData('leave-form', row)
}

// ========== 删除请假 ==========
function onActionDeleteClick(row) {
  $page.confirm(`确定要删除 ${row.employeeName} 的请假申请吗？`, async () => {
    try {
      await $page.deleteRow('LeaveRequests', row.id)
      $page.refreshTable('leave-requests-table')
      refreshStats()
      $page.showMessage('删除成功', 'success')
    } catch (err) {
      $page.showMessage('删除失败：' + err.message, 'error')
    }
  })
}

// ========== 审批操作 ==========
function onActionApproveClick(row) {
  // 只有待审批状态才能审批
  if (row.status !== 'pending') {
    $page.showMessage('该申请已审批，不可重复操作', 'warning')
    return
  }
  $page.setFormData('approve-form', row)
  $page.setFieldValue('aprv-opinion', '')
  $page.showDialog('approve-dialog')
}

function onAprvBtnApproveClick() {
  const row = $page.getFormData('approve-form')
  const opinion = $page.getFieldValue('aprv-opinion')
  if (!row || !row.id) return
  
  $page.confirm('确认通过该请假申请？', async () => {
    try {
      await $page.updateRow('LeaveRequests', row.id, {
        status: 'approved',
        approver: '当前用户',
        comment: opinion || '同意'
      })
      $page.hideDialog('approve-dialog')
      $page.refreshTable('leave-requests-table')
      refreshStats()
      $page.showMessage('审批通过', 'success')
    } catch (err) {
      $page.showMessage('审批失败：' + err.message, 'error')
    }
  })
}

function onAprvBtnRejectClick() {
  const row = $page.getFormData('approve-form')
  const opinion = $page.getFieldValue('aprv-opinion')
  if (!row || !row.id) return
  
  $page.confirm('确认拒绝该请假申请？', async () => {
    try {
      await $page.updateRow('LeaveRequests', row.id, {
        status: 'rejected',
        approver: '当前用户',
        comment: opinion || '不同意'
      })
      $page.hideDialog('approve-dialog')
      $page.refreshTable('leave-requests-table')
      refreshStats()
      $page.showMessage('已拒绝', 'success')
    } catch (err) {
      $page.showMessage('操作失败：' + err.message, 'error')
    }
  })
}

// ========== 提交表单 ==========
function onFormBtnSubmitClick() {
  const form = $page.getFormData('leave-form')
  if (!form.employeeName || !form.leaveTypeId || !form.startDate || !form.endDate || !form.totalDays) {
    $page.showMessage('请填写完整信息', 'warning')
    return
  }
  
  if (form.id) {
    // 编辑更新
    $page.updateRow('LeaveRequests', form.id, form).then(() => {
      $page.hideDialog('leave-form-dialog')
      $page.refreshTable('leave-requests-table')
      refreshStats()
      $page.showMessage('更新成功', 'success')
    }).catch(err => {
      $page.showMessage('更新失败：' + err.message, 'error')
    })
  } else {
    // 新增提交
    $page.createRow('LeaveRequests', form).then(() => {
      $page.hideDialog('leave-form-dialog')
      $page.refreshTable('leave-requests-table')
      refreshStats()
      $page.showMessage('提交成功', 'success')
    }).catch(err => {
      $page.showMessage('提交失败：' + err.message, 'error')
    })
  }
}

// ========== 取消表单 ==========
function onFormBtnCancelClick() {
  $page.hideDialog('leave-form-dialog')
  $page.clearForm('leave-form')
}

// ========== 辅助函数 ==========
function getLeaveTypeName(typeId) {
  const types = $page.getTableData('LeaveTypes')
  if (types && types.length > 0) {
    const found = types.find(t => t.id === typeId)
    return found ? found.name : '未知'
  }
  // 降级：硬编码映射
  const fallback = {
    1: '年假', 2: '事假', 3: '病假', 4: '婚假',
    5: '产假', 6: '陪产假', 7: '丧假', 8: '调休'
  }
  return fallback[typeId] || '未知'
}

function getStatusLabel(status) {
  const map = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已拒绝',
    cancelled: '已取消'
  }
  return map[status] || status
}
