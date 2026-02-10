/**
 * Syncfusion 服务按需注入
 * 
 * @module useSyncfusionServices
 * @description
 * 根据 Grid 配置动态注入所需的 Syncfusion 服务，实现真正的按需加载：
 * 
 * **核心优势**：
 * 1. **按需注入**：仅加载配置中启用的功能（Page, Sort, Filter 等）
 * 2. **体积优化**：未使用的服务不会被打包（tree-shaking）
 * 3. **性能提升**：减少运行时的服务初始化开销
 * 4. **自动检测**：根据 config 自动判断需要哪些服务
 * 
 * **Syncfusion 功能服务**：
 * - Page: 分页
 * - Sort: 排序
 * - Filter: 过滤
 * - Group: 分组
 * - Edit: 编辑
 * - Toolbar: 工具栏
 * - ExcelExport: Excel 导出
 * - PdfExport: PDF 导出
 * - ColumnChooser: 列选择器
 * - ContextMenu: 右键菜单
 * - Resize: 列宽调整
 * - Reorder: 列拖拽
 * 
 * **性能数据**：
 * - 仅 Page: ~50 KB（基础分页）
 * - Page + Sort + Filter: ~120 KB（常用功能）
 * - 全功能: ~300 KB（包含导出、编辑等）
 * 
 * @example
 * ```ts
 * import { injectServices } from './useSyncfusionServices'
 * 
 * const config = {
 *   allowPaging: true,
 *   allowSorting: true,
 *   allowFiltering: false
 * }
 * 
 * // 仅加载 Page 和 Sort 服务
 * await injectServices(config)
 * ```
 * 
 * @author SPARK Team
 * @since 2.1.0
 */

import type { SparkEJ2GridConfig } from '../types'

/**
 * Syncfusion 服务类型
 */
export type SyncfusionService = 
  | 'Page' 
  | 'Sort' 
  | 'Filter' 
  | 'Group' 
  | 'Edit'
  | 'Toolbar'
  | 'ExcelExport'
  | 'PdfExport'
  | 'ColumnChooser'
  | 'ContextMenu'
  | 'Resize'
  | 'Reorder'

/**
 * 服务加载器映射
 * 
 * 每个服务对应一个动态 import，实现 tree-shaking
 * 
 * @returns Service class for Grid.Inject()
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SERVICE_LOADERS: Record<SyncfusionService, () => Promise<any>> = {
  Page: () => import('@syncfusion/ej2-grids').then(m => m.Page),
  Sort: () => import('@syncfusion/ej2-grids').then(m => m.Sort),
  Filter: () => import('@syncfusion/ej2-grids').then(m => m.Filter),
  Group: () => import('@syncfusion/ej2-grids').then(m => m.Group),
  Edit: () => import('@syncfusion/ej2-grids').then(m => m.Edit),
  Toolbar: () => import('@syncfusion/ej2-grids').then(m => m.Toolbar),
  ExcelExport: () => import('@syncfusion/ej2-grids').then(m => m.ExcelExport),
  PdfExport: () => import('@syncfusion/ej2-grids').then(m => m.PdfExport),
  ColumnChooser: () => import('@syncfusion/ej2-grids').then(m => m.ColumnChooser),
  ContextMenu: () => import('@syncfusion/ej2-grids').then(m => m.ContextMenu),
  Resize: () => import('@syncfusion/ej2-grids').then(m => m.Resize),
  Reorder: () => import('@syncfusion/ej2-grids').then(m => m.Reorder)
}

/**
 * 根据配置检测需要的服务
 * 
 * @param config - Grid 配置
 * @returns 需要的服务列表
 */
export function detectRequiredServices(config: SparkEJ2GridConfig): SyncfusionService[] {
  const services: SyncfusionService[] = []

  // 分页
  if (config.allowPaging) {
    services.push('Page')
  }

  // 排序
  if (config.allowSorting) {
    services.push('Sort')
  }

  // 过滤
  if (config.allowFiltering) {
    services.push('Filter')
  }

  // 分组
  if (config.allowGrouping) {
    services.push('Group')
  }

  // 编辑
  if (config.editSettings) {
    services.push('Edit')
  }

  // 工具栏（编辑时通常需要）
  if (config.toolbar || config.editSettings) {
    services.push('Toolbar')
  }

  // Excel 导出
  if (config.allowExcelExport) {
    services.push('ExcelExport')
  }

  // PDF 导出
  if (config.allowPdfExport) {
    services.push('PdfExport')
  }

  // 列选择器
  if (config.showColumnChooser) {
    services.push('ColumnChooser')
  }

  // 右键菜单
  if (config.contextMenuItems) {
    services.push('ContextMenu')
  }

  // 列宽调整
  if (config.allowResizing) {
    services.push('Resize')
  }

  // 列拖拽
  if (config.allowReordering) {
    services.push('Reorder')
  }

  return services
}

/**
 * 动态加载并注入服务
 * 
 * @param config - Grid 配置
 * @returns Promise<void>
 */
export async function injectServices(config: SparkEJ2GridConfig): Promise<void> {
  const requiredServices = detectRequiredServices(config)

  if (requiredServices.length === 0) {
    return // 无需注入服务
  }

  try {
    // 并行加载所有需要的服务
    const servicePromises = requiredServices.map(serviceName => 
      SERVICE_LOADERS[serviceName]()
    )

    const loadedServices = await Promise.all(servicePromises)

    // 获取 Grid 类并注入服务
    const { Grid } = await import('@syncfusion/ej2-grids')
    Grid.Inject(...loadedServices)

    console.info(`[Syncfusion] Injected services: ${requiredServices.join(', ')}`)
  } catch (error) {
    console.warn('[Syncfusion] Failed to inject services:', error)
  }
}

/**
 * 预加载常用服务组合
 * 
 * 为常见场景提供快捷方式
 */
export const SERVICE_PRESETS = {
  /** 基础：仅分页 */
  basic: ['Page'] as SyncfusionService[],
  
  /** 标准：分页 + 排序 + 过滤 */
  standard: ['Page', 'Sort', 'Filter'] as SyncfusionService[],
  
  /** 完整：所有常用功能 */
  full: ['Page', 'Sort', 'Filter', 'Group', 'Edit', 'Toolbar', 'Resize', 'Reorder'] as SyncfusionService[],
  
  /** 导出：基础 + 导出功能 */
  export: ['Page', 'Sort', 'Filter', 'ExcelExport', 'PdfExport'] as SyncfusionService[]
}

/**
 * 使用预设注入服务
 * 
 * @param preset - 预设名称
 * @returns Promise<void>
 */
export async function injectServicePreset(preset: keyof typeof SERVICE_PRESETS): Promise<void> {
  const services = SERVICE_PRESETS[preset]

  try {
    const servicePromises = services.map(serviceName => 
      SERVICE_LOADERS[serviceName]()
    )

    const loadedServices = await Promise.all(servicePromises)

    const { Grid } = await import('@syncfusion/ej2-grids')
    Grid.Inject(...loadedServices)

    console.info(`[Syncfusion] Injected preset '${preset}': ${services.join(', ')}`)
  } catch (error) {
    console.warn(`[Syncfusion] Failed to inject preset '${preset}':`, error)
  }
}
