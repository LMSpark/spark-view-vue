/**
 * $[fieldName] 占位符演示页脚本
 */
function __init__() {
  const dataSet = $dataSet
  if (dataSet) {
    console.log('✅ [placeholder-demo] DataSet 初始化完成（使用内联数据）')
  }
}

function handleRowChange(current) {
  console.log('[placeholder-demo] handleRowChange:', current)
}
