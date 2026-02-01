import { $refreshData, $data } from '@/utils/page-helpers/common.js'
import { ElMessage } from 'element-plus'

/**
 * 刷新所有数据
 */
export async function refreshAllData() {
  try {
    ElMessage.info('正在刷新数据...')
    await $refreshData()
    ElMessage.success('所有数据刷新成功！')
    console.log('刷新后的数据:', $data())
  } catch (error) {
    ElMessage.error('刷新数据失败')
    console.error('刷新失败:', error)
  }
}

/**
 * 只刷新订单数据
 */
export async function refreshOrders() {
  try {
    ElMessage.info('正在刷新订单数据...')
    await $refreshData('recentOrders')
    ElMessage.success('订单数据刷新成功！')
    console.log('最新订单:', $data().recentOrders)
  } catch (error) {
    ElMessage.error('刷新订单数据失败')
    console.error('刷新失败:', error)
  }
}
