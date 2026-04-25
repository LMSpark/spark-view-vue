// 财务凭证录入系统 - 页面脚本
function __init__() {
  console.log('财务凭证录入系统页面已加载')
}

// 凭证录入 - 保存凭证
function saveVoucher() {
  const ds = PageDataSet
  const voucher = ds.tables.Vouchers
  const items = ds.tables.VoucherItems

  // 校验凭证头
  if (!voucher.currentRow.voucherDate) {
    SparkToast.warning('请填写凭证日期')
    return
  }
  if (!voucher.currentRow.summary) {
    SparkToast.warning('请填写摘要')
    return
  }

  // 校验分录
  const rows = items.rows
  if (!rows || rows.length === 0) {
    SparkToast.warning('请至少添加一条分录')
    return
  }

  // 校验借贷平衡
  let totalDebit = 0
  let totalCredit = 0
  for (const row of rows) {
    if (!row.accountCode) {
      SparkToast.warning('请选择会计科目')
      return
    }
    if (!row.amount || row.amount <= 0) {
      SparkToast.warning('金额必须大于0')
      return
    }
    if (row.direction === '借') {
      totalDebit += row.amount
    } else if (row.direction === '贷') {
      totalCredit += row.amount
    }
  }

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    SparkToast.error(`借贷不平衡！借方合计: ${totalDebit.toFixed(2)}，贷方合计: ${totalCredit.toFixed(2)}`)
    return
  }

  // 保存凭证
  voucher.commit().then(() => {
    // 批量保存分录
    return Promise.all(rows.map(row => {
      row.voucherId = voucher.currentRow.id
      return items.commit(row)
    }))
  }).then(() => {
    SparkToast.success('凭证保存成功')
    voucher.refresh()
    items.refresh()
  }).catch(err => {
    SparkToast.error('保存失败: ' + err.message)
  })
}

// 新增分录
function addDetailRow() {
  const ds = PageDataSet
  ds.tables.VoucherItems.createRow({
    direction: '借',
    amount: 0
  })
}

// 删除分录
function deleteDetailRow(row) {
  const ds = PageDataSet
  ds.tables.VoucherItems.deleteRow(row.id)
}

// 科目选择联动 - 自动填充科目名称
function onAccountSelected(row, account) {
  if (account) {
    row.accountName = account.accountName
  }
}

// 凭证查询 - 查看凭证详情
function viewVoucher(row) {
  const ds = PageDataSet
  ds.tables.Vouchers.setCurrentRow(row.id)
  // 切换到录入标签页查看
  SparkToast.info('已加载凭证详情，可在"凭证录入"标签页查看')
}

// 刷新凭证列表
function refreshVoucherList() {
  PageDataSet.tables.Vouchers.refresh()
}
