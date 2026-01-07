import { $data, $rebindRules } from '../common.js'
import { updateRow, deleteRow } from '../datasetHelper.js'
import { DataSetManager } from '../../utils/dataSetManager'
import { ElMessage, ElMessageBox } from 'element-plus'

let dataSetManager = null

/**
 * 初始化 DataSet Manager
 */
export function init() {
  const pageData = $data()
  dataSetManager = new DataSetManager(pageData.dataset)
  
  // 监听级联更新事件
  dataSetManager.on('cascadeUpdate', ({ parentTable, childTable, parentRow, oldValues }) => {
    console.log('🔄 级联更新触发:')
    console.log(`  父表: ${parentTable}`)
    console.log(`  子表: ${childTable}`)
    console.log(`  父行新值:`, parentRow)
    console.log(`  父行旧值:`, oldValues)
    
    ElMessage.success(`${childTable} 已自动更新以匹配 ${parentTable}`)
  })
  
  // 监听级联删除事件
  dataSetManager.on('cascadeDelete', ({ parentTable, childTable, parentRow, deletedRows }) => {
    console.log('🗑️ 级联删除触发:')
    console.log(`  父表: ${parentTable}`)
    console.log(`  子表: ${childTable}`)
    console.log(`  删除的父行:`, parentRow)
    console.log(`  删除的子行数量: ${deletedRows.length}`)
    
    if (deletedRows.length > 0) {
      ElMessage.warning(`删除 ${parentTable} 时已自动删除 ${deletedRows.length} 个 ${childTable} 记录`)
    }
  })
  
  console.log('✅ DataSetManager 初始化完成，级联功能已启用')
}

/**
 * 修改用户ID - 测试级联更新
 */
export async function handleUpdateUserId(row) {
  const oldUserId = row.id
  
  try {
    const { value: newUserId } = await ElMessageBox.prompt(
      `当前用户ID: ${oldUserId}\n\n输入新的用户ID（将自动更新所有订单的 userId）:`,
      '级联更新测试',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /^\d+$/,
        inputErrorMessage: '请输入有效的数字ID'
      }
    )
    
    const newId = parseInt(newUserId)
    if (newId === oldUserId) {
      ElMessage.info('ID未改变')
      return
    }
    
    const pageData = $data()
    
    // 检查新ID是否已存在
    const existingUser = pageData.dataset.tables[0].rows.find(u => u.id === newId)
    if (existingUser) {
      ElMessage.error(`ID ${newId} 已存在，请使用其他ID`)
      return
    }
    
    console.log(`\n🔄 开始级联更新: 用户ID ${oldUserId} -> ${newId}`)
    
    // 更新用户ID（触发级联更新）
    const count = updateRow(
      pageData.dataset,
      'Users',
      r => r.id === oldUserId,
      { id: newId },
      dataSetManager  // ✅ 传入 manager 启用级联
    )
    
    if (count > 0) {
      $rebindRules()
      
      // 统计更新的订单数量
      const updatedOrders = pageData.dataset.tables[1].rows.filter(o => o.userId === newId)
      ElMessage.success(
        `用户ID更新成功！\n已自动更新 ${updatedOrders.length} 个订单的 userId`
      )
      
      console.log(`✅ 级联更新完成:`)
      console.log(`  更新用户: ${count} 个`)
      console.log(`  更新订单: ${updatedOrders.length} 个`)
    }
  } catch {
    console.log('❌ 用户取消操作')
  }
}

/**
 * 删除用户 - 测试级联删除
 */
export async function handleDeleteUser(row) {
  const userId = row.id
  const userName = row.name
  const pageData = $data()
  
  // 计算将删除的关联数据
  const orders = pageData.dataset.tables[1].rows.filter(o => o.userId === userId)
  const orderIds = orders.map(o => o.id)
  const orderItems = pageData.dataset.tables[2].rows.filter(
    item => orderIds.includes(item.orderId)
  )
  
  console.log(`\n🗑️ 准备级联删除:`)
  console.log(`  用户: ${userName} (ID: ${userId})`)
  console.log(`  关联订单: ${orders.length} 个`)
  console.log(`  订单明细: ${orderItems.length} 个`)
  
  // 确认对话框
  try {
    await ElMessageBox.confirm(
      `确定删除用户 "${userName}" 吗？\n\n⚠️ 这将同时删除:\n` +
      `• ${orders.length} 个订单\n` +
      `• ${orderItems.length} 个订单明细\n\n` +
      `此操作将递归执行级联删除！`,
      '危险操作',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    // 执行级联删除
    const count = deleteRow(
      pageData.dataset,
      'Users',
      r => r.id === userId,
      dataSetManager  // ✅ 传入 manager 启用级联
    )
    
    if (count > 0) {
      $rebindRules()
      
      ElMessage.success(
        `删除成功！\n` +
        `用户: ${count} 个\n` +
        `订单: ${orders.length} 个\n` +
        `订单明细: ${orderItems.length} 个`
      )
      
      console.log(`✅ 级联删除完成:`)
      console.log(`  删除用户: ${count} 个`)
      console.log(`  删除订单: ${orders.length} 个`)
      console.log(`  删除订单明细: ${orderItems.length} 个`)
    }
  } catch {
    console.log('❌ 用户取消删除')
    ElMessage.info('已取消删除')
  }
}
