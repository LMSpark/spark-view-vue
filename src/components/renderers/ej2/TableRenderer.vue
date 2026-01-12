<template>
  <ejs-grid
    :dataSource="gridData"
    :columns="columns"
    :allowPaging="gridProps.allowPaging"
    :allowSorting="gridProps.allowSorting"
    :allowFiltering="gridProps.allowFiltering"
    :allowExcelExport="gridProps.allowExcelExport"
    :allowPdfExport="gridProps.allowPdfExport"
    :allowGrouping="gridProps.allowGrouping"
    :allowReordering="gridProps.allowReordering"
    :allowResizing="gridProps.allowResizing"
    :showColumnChooser="gridProps.showColumnChooser"
    :enableVirtualization="gridProps.enableVirtualization"
    :enableInfiniteScrolling="gridProps.enableInfiniteScrolling"
    :editSettings="gridProps.editSettings"
    :toolbar="gridProps.toolbar"
    :pageSettings="gridProps.pageSettings"
    :filterSettings="gridProps.filterSettings"
    :selectionSettings="gridProps.selectionSettings"
    :gridLines="gridProps.gridLines"
    :height="gridProps.height"
    :width="gridProps.width"
  >
  </ejs-grid>
</template>

<script lang="ts" setup>
import { computed, provide } from 'vue'
import { GridComponent as EjsGrid, Sort, Page, Resize, Toolbar, Filter, ExcelExport, PdfExport, ColumnChooser, Group, Reorder } from '@syncfusion/ej2-vue-grids'

interface Props {
  config: any
  parentType?: any  // 接受任意类型，form-create 可能传入对象
  data?: any
}

const props = defineProps<Props>()

// 注入 EJ2 Grid 功能模块
provide('grid', [Sort, Page, Resize, Toolbar, Filter, ExcelExport, PdfExport, ColumnChooser, Group, Reorder])

// 解析 dataSource：支持字符串路径或 { dataKey: 'path' } 格式
const getDataSourcePath = () => {
  // 优先使用 config.dataKey（DynamicPage 传递的）
  if (props.config.dataKey) return props.config.dataKey
  
  const ds = props.config.props?.dataSource || props.config.dataSource
  if (typeof ds === 'string') return ds
  if (ds && typeof ds === 'object' && 'dataKey' in ds) return ds.dataKey
  return null
}

const gridData = computed(() => {
  const path = getDataSourcePath()
  console.log('[TableRenderer] dataSource path:', path)
  console.log('[TableRenderer] props.data type:', typeof props.data, props.data)
  console.log('[TableRenderer] props.config.dataKey:', props.config.dataKey)
  console.log('[TableRenderer] props.config.props:', props.config.props)
  
  if (!path) {
    console.warn('[TableRenderer] No dataSource path found')
    return []
  }
  
  if (!props.data || typeof props.data !== 'object') {
    console.warn('[TableRenderer] props.data is invalid:', props.data)
    return []
  }
  
  const keys = path.split('.')
  let result = props.data
  console.log('[TableRenderer] Resolving path:', keys)
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    console.log(`  [${i}] key="${key}", result:`, result)
    result = result?.[key]
    if (!result && i < keys.length - 1) {
      console.warn(`[TableRenderer] Cannot find data at key: "${key}"`)
      return []
    }
  }
  
  console.log('[TableRenderer] Final gridData:', result)
  return Array.isArray(result) ? result : []
})

// 从 children 中提取列定义（兼容 e-columns/e-column 结构）
const columns = computed(() => {
  const children = props.config.children
  console.log('[TableRenderer] config.children:', children)
  
  if (!children || !Array.isArray(children)) {
    console.warn('[TableRenderer] No children found')
    return []
  }
  
  // 查找 e-columns 容器
  const eColumns = children.find((c: any) => c.type === 'e-columns')
  console.log('[TableRenderer] e-columns:', eColumns)
  
  const columnList = eColumns?.children || children
  console.log('[TableRenderer] columnList:', columnList)
  
  const parsedColumns = columnList
    .filter((c: any) => c.type === 'e-column')
    .map((col: any) => {
      const colProps = col.props || {}
      return {
        field: colProps.field,
        headerText: colProps.headerText,
        width: colProps.width,
        type: colProps.type,
        format: colProps.format,
        textAlign: colProps.textAlign || 'Left',
        isPrimaryKey: colProps.isPrimaryKey,
        visible: colProps.visible !== false,
        allowEditing: colProps.allowEditing !== false,
        allowSorting: colProps.allowSorting !== false,
        allowFiltering: colProps.allowFiltering !== false
      }
    })
  
  console.log('[TableRenderer] Parsed columns:', parsedColumns)
  return parsedColumns
})

// EJ2 Grid 配置（合并 props 和 config）
const gridProps = computed(() => {
  const configProps = props.config.props || {}
  
  return {
    allowPaging: configProps.allowPaging ?? true,
    allowSorting: configProps.allowSorting ?? true,
    allowFiltering: configProps.allowFiltering ?? false,
    allowExcelExport: configProps.allowExcelExport ?? false,
    allowPdfExport: configProps.allowPdfExport ?? false,
    allowGrouping: configProps.allowGrouping ?? false,
    allowReordering: configProps.allowReordering ?? false,
    allowResizing: configProps.allowResizing ?? true,
    showColumnChooser: configProps.showColumnChooser ?? false,
    enableVirtualization: configProps.enableVirtualization ?? false,
    enableInfiniteScrolling: configProps.enableInfiniteScrolling ?? false,
    editSettings: configProps.editSettings || { allowEditing: false, allowAdding: false, allowDeleting: false },
    toolbar: configProps.toolbar || [],
    pageSettings: configProps.pageSettings || { pageSize: 10, pageSizes: [10, 20, 50, 100] },
    filterSettings: configProps.filterSettings || { type: 'Menu' },
    selectionSettings: configProps.selectionSettings || { mode: 'Row', type: 'Single' },
    gridLines: configProps.gridLines || 'Both',
    height: configProps.height || 'auto',
    width: configProps.width || 'auto'
  }
})
</script>

<style scoped>
/* EJ2 Grid 样式可在此自定义 */
:deep(.e-grid) {
  font-family: inherit;
}
</style>
