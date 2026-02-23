/**
 * DataSet 管理 Composable
 *
 * 位于 spark-component 渲染层，负责将 spark-data 的 DataSet
 * 与 Vue 响应式系统桥接（shallowRef + 生命周期管理）。
 *
 * 职责单一：仅关注 DataSet 生命周期，不持有 UI/Rule 相关依赖。
 * DataSet ↔ el-table 的同步桥由 useRuleBinding 单独负责。
 */

import { shallowRef, type Ref, onUnmounted } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { DataSet } from '@spark-view/spark-data'
import type { IDataSetMetadata } from '@spark-view/spark-data'

const pageLogger = Logger('PageRenderer:DataSet')

/**
 * DataSet 管理选项接口
 */
export interface UsePageDataSetOptions {
  enableDataSet?: boolean
}

/** DataSet 管理返回值接口 */
export interface UsePageDataSetReturn {
  dataSet: Ref<DataSet | null>
  /** pagedata.json 原始对象 或 已编译的 DataSet 实例 → 初始化 DataSet
   * - 传入 DataSet 实例时：直接赋值，跳过归一化
   * - 传入原始对象时：就地归一化并构建 DataSet
   */
  initDataSet: (rawPageData: Record<string, unknown> | DataSet) => void
  clearDataSet: () => void
}

/**
 * DataSet 管理 Hook
 *
 * @example
 * ```typescript
 * const { dataSet, initDataSet } = usePageDataSet({ enableDataSet: true })
 * initDataSet(config.data)
 * ```
 */
export function usePageDataSet(options: UsePageDataSetOptions): UsePageDataSetReturn {
  const { enableDataSet = true } = options

  const dataSet = shallowRef<DataSet | null>(null)
  /** 当前 DataSet 对应的 pagedata._version，undefined = 无版本信息 */
  let currentDataVersion: unknown = undefined

  /**
   * pagedata.json 原始对象 → 归一化 → DataSet（唯一缓存，不写入 pageData）
   */
  const initDataSet = (rawPageData: Record<string, unknown> | DataSet) => {
    if (!enableDataSet) return

    // 🔍 类型验证：检测到字符串或无效数据时报错
    if (typeof rawPageData === 'string') {
      const preview = (rawPageData as string).substring(0, 100)
      pageLogger.error('❌ 检测到无效的缓存数据（字符串），需要清除浏览器缓存', {
        type: typeof rawPageData,
        preview
      })
      // 尝试自动清除相关缓存
      if (typeof localStorage !== 'undefined') {
        const keys = Object.keys(localStorage).filter(k => k.includes('pagedata') || k.includes('spark_file_'))
        for (const k of keys) {
          pageLogger.warn('  清除缓存键:', k)
          localStorage.removeItem(k)
        }
        pageLogger.warn('✅ 已清除 ' + keys.length + ' 个缓存项，请刷新页面')
      }
      return
    }

    // DataSet 实例直接赋值，跳过归一化（已由 parsePageData 编译并缓存）
    if (rawPageData instanceof DataSet) {
      dataSet.value = rawPageData
      currentDataVersion = rawPageData.version
      pageLogger.debug('DataSet 直接赋值（已编译实例）', {
        tables: Object.keys(rawPageData.tables || {})
      })
      return
    }

    // 🔍 检测 DataSet 元数据格式（缓存反序列化后的普通对象）
    if (rawPageData && typeof rawPageData === 'object' && 'tables' in rawPageData) {
      const metadata = rawPageData as { dataSetName?: string; tables?: unknown }
      if (metadata.tables && typeof metadata.tables === 'object') {
        pageLogger.debug('检测到 DataSet 元数据格式，使用 fromData 转换')
        dataSet.value = DataSet.fromData(rawPageData as unknown as IDataSetMetadata)
        currentDataVersion = (rawPageData as { version?: unknown }).version
        pageLogger.debug('DataSet 从元数据创建', {
          tables: Object.keys(dataSet.value.tables || {})
        })
        return
      }
    }

    // 版本对齐：rawPageData._version 存在且与当前缓存版本一致 → 直接复用 DataSet
    const incomingVersion = rawPageData['_version']
    if (incomingVersion !== undefined && incomingVersion === currentDataVersion && dataSet.value) {
      pageLogger.debug('DataSet 版本命中，跳过重建', { version: incomingVersion })
      return
    }

    // 清理旧的 DataSet
    dataSet.value = DataSet.fromPageData(rawPageData)
    currentDataVersion = incomingVersion

    pageLogger.debug('DataSet 初始化成功（pagedata 归一化）', {
      tables: dataSet.value ? Object.keys(dataSet.value.tables || {}) : []
    })
  }

  /**
   * 清理 DataSet（SRP：单一职责 - 只负责清理）
   */
  const clearDataSet = () => {
    dataSet.value = null
    currentDataVersion = undefined
  }

  onUnmounted(() => {
    clearDataSet()
  })

  return {
    dataSet,
    initDataSet,
    clearDataSet
  }
}
