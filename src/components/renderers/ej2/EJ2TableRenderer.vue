<script setup lang="ts">
import { computed, provide } from 'vue'
import { 
  GridComponent as EjsGrid,
  Page,
  Sort,
  Filter,
  Group,
  Toolbar,
  ExcelExport,
  PdfExport,
  ColumnChooser,
  VirtualScroll
} from '@syncfusion/ej2-vue-grids'
import EJ2ColumnsWrapper from './EJ2ColumnsWrapper.vue'

// Form-create passes rule properties directly as props
// Use 'any' for internal rule props to avoid type warnings
interface Props {
  type?: any  // form-create internal
  dataSource?: any[]  // form-create sets this via props.dataSource
  dataKey?: any  // form-create internal
  allowPaging?: any  // boolean or object from form-create
  allowSorting?: any  // boolean or object from form-create
  allowFiltering?: any  // boolean or object from form-create
  allowGrouping?: any  // boolean or object from form-create
  allowExcelExport?: any  // boolean or object from form-create
  allowPdfExport?: any  // boolean or object from form-create
  enableVirtualization?: any  // boolean or object from form-create
  showColumnChooser?: any  // boolean or object from form-create
  height?: any  // number, string or object from form-create
  width?: any  // number, string or object from form-create
  toolbar?: any  // can be array or object from form-create
  pageSettings?: {
    pageSize?: number
    pageSizes?: number[]
  }
  editSettings?: {
    allowEditing?: boolean
    allowAdding?: boolean
    allowDeleting?: boolean
    mode?: string
  }
  filterSettings?: {
    type?: string
  }
  selectionSettings?: {
    mode?: string
    type?: string
  }
  children?: any  // can be array or object from form-create
}

const props = withDefaults(defineProps<Props>(), {
  allowPaging: false,
  allowSorting: false,
  allowFiltering: false,
  allowGrouping: false,
  allowExcelExport: false,
  allowPdfExport: false,
  enableVirtualization: false,
  showColumnChooser: false
})

// Provide EJ2 Grid services (required for features to work)
provide('grid', [
  Page, 
  Sort, 
  Filter, 
  Group, 
  Toolbar, 
  ExcelExport, 
  PdfExport, 
  ColumnChooser, 
  VirtualScroll
])

const emit = defineEmits<{
  update: [field: string, value: unknown]
  'action-complete': [args: unknown]
  'selection-change': [args: unknown]
}>()

// Grid data is passed directly via dataSource prop (set by DynamicPage.vue)
const gridData = computed(() => {
  return Array.isArray(props.dataSource) ? props.dataSource : []
})

// Normalize toolbar prop (can be array or object from form-create)
const toolbarItems = computed(() => {
  if (Array.isArray(props.toolbar)) {
    return props.toolbar
  }
  return undefined
})

// Normalize children prop (can be array or object from form-create)
const columns = computed(() => {
  if (Array.isArray(props.children)) {
    return props.children
  }
  return []
})

// 处理编辑完成事件
const handleActionComplete = (args: any) => {
  emit('action-complete', args)
  
  // 如果是编辑操作，触发 update 事件
  if (args.requestType === 'save' && args.data) {
    // 这里可以根据需要处理数据更新
    const field = args.columnName
    const value = args.data[field]
    if (field) {
      emit('update', field, value)
    }
  }
}

// 处理选择变化事件
const handleRowSelected = (args: any) => {
  emit('selection-change', args)
}
</script>

<template>
  <div class="ej2-grid-wrapper">
    <ejs-grid
      :data-source="gridData"
      :height="height"
      :width="width"
      :allow-paging="allowPaging"
      :allow-sorting="allowSorting"
      :allow-filtering="allowFiltering"
      :allow-grouping="allowGrouping"
      :allow-excel-export="allowExcelExport"
      :allow-pdf-export="allowPdfExport"
      :enable-virtualization="enableVirtualization"
      :show-column-chooser="showColumnChooser"
      :toolbar="toolbarItems"
      :page-settings="pageSettings"
      :edit-settings="editSettings"
      :filter-settings="filterSettings"
      :selection-settings="selectionSettings"
      @action-complete="handleActionComplete"
      @row-selected="handleRowSelected"
    >
      <!-- 使用包装组件支持多层 SLOT -->
      <EJ2ColumnsWrapper :columns="columns">
        <!-- 
          三种 SLOT 使用方式（按需选择）：
          
          方式1：列表级 SLOT - 完全自定义所有列
          <template #default="{ columns: cols }">
            <e-column v-for="col in cols" :key="col.field" v-bind="col" />
          </template>
          
          方式2：列级 SLOT - 自定义单个列
          <template #column="{ column: col, index }">
            <e-column :field="col.field" :header-text="col.headerText + '✨'" />
          </template>
          
          方式3：字段级 SLOT - 使用默认渲染
          不传 slot，使用内置的字段渲染逻辑
        -->
      </EJ2ColumnsWrapper>
    </ejs-grid>
  </div>
</template>

<style scoped>
.ej2-grid-wrapper {
  width: 100%;
  margin: 20px 0;
}

/* EJ2 Grid 全局样式会自动应用 */
</style>
