// 请假申请页面脚本
// 处理请假表单提交后的业务逻辑

const ds = globalThis.ds;

// 提交申请按钮点击时，更新状态为 pending 并通知
const onLeaveFormSubmit = () => {
  const currentRow = ds.leave_requests.currentRow;
  if (currentRow) {
    ds.leave_requests.patchCurrent({ status: 'pending' });
    ds.leave_requests.refresh();
  }
};
