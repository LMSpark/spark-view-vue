// 请假管理系统 - 页面脚本
function __init__() {
  console.log('[请假管理] 页面已加载')
  refreshStats()
}

function getView(tableName, viewId) {
  return $dataSet ? $dataSet.getView(tableName, viewId || 'default') : null
}

function getRows(tableName, viewId) {
  const view = getView(tableName, viewId)
  return view ? view.rows : []
}

function getComponentApi(id) {
  return $components.getApi(id)
}

function getLeaveView() {
  return getView('LeaveRequests', 'default')
}

function getCurrentLeaveRow() {
  const view = getLeaveView()
  return view ? view.currentRow : null
}

function setCurrentLeaveRow(row) {
  const view = getLeaveView()
  if (view) view.setCurrentRow(row || null)
}

// ========== 统计刷新 ==========
function refreshStats() {
  const rows = getRows('LeaveRequests')
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

  console.log('[请假管理] 统计', { pendingCount, approvedCount, rejectedCount, totalCount })
}

// ========== 新增请假 ==========
function onBtnAddClick() {
  setCurrentLeaveRow(null)
  getComponentApi('leave-form')?.resetFields?.()
  getComponentApi('leave-form-dialog')?.open?.()
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
  setCurrentLeaveRow(row)
  getComponentApi('leave-form-dialog')?.open?.()
}

// ========== 删除请假 ==========
async function onActionDeleteClick(row) {
  const confirmed = await $page.showConfirm(`确定要删除 ${row.employeeName} 的请假申请吗？`, '删除确认')
  if (!confirmed) return
  const view = getLeaveView()
  if (!view || !row || row.id === undefined) return
  const deleted = view.deleteRowById(row.id)
  if (!deleted) {
    $page.showMessage('删除失败：未找到记录', 'error')
    return
  }
  refreshStats()
  $page.showMessage('删除成功', 'success')
}

// ========== 审批操作 ==========
function onActionApproveClick(row) {
  if (row.status !== 'pending') {
    $page.showMessage('该申请已审批，不可重复操作', 'warning')
    return
  }
  setCurrentLeaveRow(row)
  getComponentApi('approve-form')?.setFieldValue?.('comment', '')
  getComponentApi('approve-dialog')?.open?.()
}

async function updateApprovalStatus(status, successMessage) {
  const row = getCurrentLeaveRow()
  const opinionData = getComponentApi('approve-form')?.getFormData?.() || {}
  const opinion = opinionData.comment || ''
  if (!row || !row.id) return

  if (!opinion || opinion.trim() === '') {
    $page.showMessage('请填写审批意见', 'warning')
    return
  }

  const confirmed = await $page.showConfirm(status === 'approved' ? '确认通过该请假申请？' : '确认拒绝该请假申请？', '审批确认')
  if (!confirmed) return

  const view = getLeaveView()
  if (!view) return
  const updated = view.updateRowById(row.id, {
    status,
    approver: '当前用户',
    comment: opinion.trim()
  })
  if (!updated) {
    $page.showMessage('操作失败：未找到记录', 'error')
    return
  }
  getComponentApi('approve-dialog')?.close?.()
  refreshStats()
  $page.showMessage(successMessage, 'success')
}

function onAprvBtnApproveClick() {
  return updateApprovalStatus('approved', '审批通过')
}

function onAprvBtnRejectClick() {
  return updateApprovalStatus('rejected', '已拒绝')
}

// ========== 提交表单 ==========
function onFormBtnSubmitClick() {
  const form = getComponentApi('leave-form')?.getFormData?.()
  if (!form) return
  if (!form.employeeName || !form.leaveTypeId || !form.startDate || !form.endDate || !form.totalDays) {
    $page.showMessage('请填写完整信息', 'warning')
    return
  }

  const view = getLeaveView()
  if (!view) return

  if (form.id) {
    const updated = view.updateRowById(form.id, form)
    if (!updated) {
      $page.showMessage('更新失败：未找到记录', 'error')
      return
    }
    getComponentApi('leave-form-dialog')?.close?.()
    refreshStats()
    $page.showMessage('更新成功', 'success')
  } else {
    const maxId = getRows('LeaveRequests').reduce((max, item) => Math.max(max, Number(item.id) || 0), 0)
    view.appendRow({
      ...form,
      id: maxId + 1,
      status: 'pending',
      createdAt: new Date().toISOString()
    })
    getComponentApi('leave-form-dialog')?.close?.()
    refreshStats()
    $page.showMessage('提交成功', 'success')
  }
}

// ========== 取消表单 ==========
function onFormBtnCancelClick() {
  getComponentApi('leave-form-dialog')?.close?.()
  getComponentApi('leave-form')?.resetFields?.()
}

// ========== 辅助函数 ==========
function getLeaveTypeName(typeId) {
  const types = getRows('LeaveTypes')
  const found = types.find(t => t.id === typeId)
  if (found) return found.name
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
