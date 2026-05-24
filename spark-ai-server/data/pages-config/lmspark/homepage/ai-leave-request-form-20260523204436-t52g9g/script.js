// 请假申请页面脚本
function __init__() {
  console.log('请假申请页面已加载');
}

// 提交前校验
function validateBeforeSubmit(row) {
  if (!row.applicantName) { alert('请填写申请人'); return false; }
  if (!row.leaveType) { alert('请选择请假类型'); return false; }
  if (!row.startDate) { alert('请选择开始日期'); return false; }
  if (!row.endDate) { alert('请选择结束日期'); return false; }
  if (!row.days || row.days < 1) { alert('请假天数至少1天'); return false; }
  return true;
}
