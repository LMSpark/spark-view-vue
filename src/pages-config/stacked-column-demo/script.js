/**
 * EJ2 堆叠列演示页面脚本
 * 展示 EJ2StackedColumnRenderer 组件的使用
 */

/**
 * 初始化函数
 * 页面加载时自动调用
 */
export function __init__() {
  console.log('✅ 堆叠列演示页面已初始化')
}

/**
 * 工具栏点击事件处理
 */
export function handleToolbarClick(args) {
  const grid = document.getElementById('grid3')?.ej2_instances?.[0]
  if (!grid) return
  
  if (args.item.id === 'grid3_excelexport') {
    grid.excelExport()
    console.log('📊 导出 Excel')
  } else if (args.item.id === 'grid3_pdfexport') {
    grid.pdfExport()
    console.log('📄 导出 PDF')
  }
}

/**
 * Excel 导出处理
 */
export function handleExcelExport() {
  const grid = document.getElementById('grid3')?.ej2_instances?.[0]
  if (grid) {
    grid.excelExport()
    console.log('📊 导出 Excel')
  }
}

/**
 * PDF 导出处理
 */
export function handlePdfExport() {
  const grid = document.getElementById('grid3')?.ej2_instances?.[0]
  if (grid) {
    grid.pdfExport()
    console.log('📄 导出 PDF')
  }
}

/**
 * 行双击事件处理
 */
export function handleRowDoubleClick(args) {
  console.log('🖱️ 双击行:', args.rowData)
  alert(`订单详情:\n订单ID: ${args.rowData.OrderID}\n客户: ${args.rowData.CustomerName}\n国家: ${args.rowData.ShipCountry}`)
}

/**
 * 数据绑定完成事件
 */
export function dataBound(args) {
  console.log('✅ 数据绑定完成')
}

/**
 * 查询单元格信息（可用于自定义单元格样式）
 */
export function queryCellInfo(args) {
  // 状态列着色
  if (args.column.field === 'Status') {
    if (args.data.Status === 'Delivered') {
      args.cell.classList.add('status-delivered')
    } else if (args.data.Status === 'Shipped') {
      args.cell.classList.add('status-shipped')
    } else if (args.data.Status === 'Processing') {
      args.cell.classList.add('status-processing')
    }
  }
  
  // 付款状态着色
  if (args.column.field === 'PaymentStatus') {
    if (args.data.PaymentStatus === 'Paid') {
      args.cell.classList.add('payment-paid')
    } else if (args.data.PaymentStatus === 'Pending') {
      args.cell.classList.add('payment-pending')
    }
  }
}
