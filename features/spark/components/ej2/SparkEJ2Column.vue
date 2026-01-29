<template>
  <!-- 顶级列用 e-column 包装，非顶级列直接渲染 -->
  <e-column
    v-if="isTopLevelColumn"
    :field="props.config.field"
    :header-text="props.config.headerText"
    :width="props.config.width"
    :text-align="props.config.textAlign"
    :format="props.config.format"
    :template="props.config.template"
    :visible="props.config.visible"
    :allow-sorting="props.config.allowSorting"
    :allow-filtering="props.config.allowFiltering"
    :columns="dynamicColumns"
  >
    <component
      :is="getSparkComponent(child.type || 'spark-ej2-column')"
      v-for="(child, index) in props.config.children || []"
      :key="`subcolumn-${index}`"
      :config="child"
      :parent-context="context"
    />
  </e-column>
  <!-- 非顶级列直接渲染子组件，不使用 e-column 包装器 --> 
  <template v-else>
    <component
      :is="getSparkComponent(child.type || 'spark-ej2-column')"
      v-for="(child, index) in props.config.children || []"
      :key="`subcolumn-${index}`"
      :config="child"
      :parent-context="context"
    />
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSparkComponent } from '@spark-view/spark-core'
// getColumnConfig now provided by useSparkComponent; helper import removed
import type { SparkComponentConfig, SparkComponentContext } from '@spark-view/spark-core'
import type { ColumnModel } from '@syncfusion/ej2-vue-grids'

interface SparkEJ2ColumnConfig extends SparkComponentConfig {
  type: 'spark-ej2-column'
  field?: string
  headerText?: string
  width?: string | number
  textAlign?: string
  format?: string
  template?: any
  visible?: boolean
  allowSorting?: boolean
  allowFiltering?: boolean
  children?: SparkEJ2ColumnConfig[]
}

interface Props {
  config: SparkEJ2ColumnConfig
  parentContext?: SparkComponentContext
}

const props = defineProps<Props>()

const { context, registerProvider, GetProvider, getSparkComponent } = useSparkComponent({
  config: props.config as SparkComponentConfig,
  parentContext: props.parentContext
})

// 动态添加的子列（存储在 EJ2 ColumnModel 的 columns 属性中）
const dynamicColumns = ref<ColumnModel[]>([])



// 是否为顶级列
const isTopLevelColumn = computed(() =>
  !props.parentContext || props.parentContext.type === 'spark-ej2-grid'
)

// 非顶级列把自己注册到父列
if (!isTopLevelColumn.value) {
  // 直接使用类型化的 helper 获取父列实现（使用通用 GetProvider），简洁且无需 inline cast
  const parentColumnConfig = GetProvider('columnConfig') as { addChildColumn?: (childConfig: ColumnModel) => void } | undefined
  if (parentColumnConfig?.addChildColumn) {
    // 把当前列配置转换为 ColumnModel
    const currentColumnModel: ColumnModel = {
      field: props.config.field || '',
      headerText: props.config.headerText || '',
      ...(props.config.width !== undefined && { width: props.config.width }),
      textAlign: props.config.textAlign as any,
      // 其他属性...
    }
    parentColumnConfig.addChildColumn(currentColumnModel)
  }
}

// 提供能力给子组件
registerProvider('columnConfig', {
  addChildColumn: (childConfig: ColumnModel) => {
    dynamicColumns.value.push(childConfig)
  },
  removeChildColumn: (index: number) => {
    dynamicColumns.value.splice(index, 1)
  }
})
</script>

<style scoped>
/* SPARK EJ2 Column 样式 */
</style>