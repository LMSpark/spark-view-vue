<template>
  <el-collapse-item
    :name="itemName"
    :title="itemTitle"
    :disabled="itemDisabled"
  >
    <RendererHostScope
      type="r-collapse-item-field-scope"
      :field-mode="'detail'"
      :body-class="['renderer-collapse-item-body', itemBodyClass]"
      item-class="renderer-collapse-item-grid-item"
      :children="itemChildren"
      :grid-columns="gridColumns"
      :grid-gap="gridGap"
      :grid-auto-rows="gridAutoRows"
    >
      <slot />
    </RendererHostScope>
  </el-collapse-item>
</template>

<script setup lang="ts">
/**
 * @skill r-collapse-item
 * @description 折叠面板项，面板体内以 24 列网格渲染子组件。
 * @category internal
 */
import { computed } from 'vue'
import { useSparkComponent } from '../../internal'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import RendererHostScope from '../support/RendererHostScope.vue'

interface Props {
  type?: string
  /** 原始属性包（透传） */
  props?: { [key: string]: unknown }
  children?: SparkNode['children']
  id?: string
  /** 面板唯一标识 */
  name?: string | number
  /** 面板标题 */
  title?: string
  /** 面板标签（title 别名） */
  label?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 面板体自定义 class */
  bodyClass?: string
  /** CSS Grid 列数 */
  gridColumns?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 栅格间距 */
  gridGap?: number | string
  /** 在父容器中的位置序号 */
  index: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-collapse-item',
})

useSparkComponent(props)

const itemChildren = computed(() => getSparkNodeChildren(props.children))
const itemBodyClass = computed(() => typeof props.bodyClass === 'string' ? props.bodyClass : '')

const itemName = computed<string | number>(() => {
  const value = props.name ?? props.id
  return typeof value === 'string' || typeof value === 'number' ? value : `collapse-${props.index}`
})

const itemTitle = computed(() => {
  const value = props.title ?? props.label
  return typeof value === 'string' && value.trim().length > 0 ? value : `分组${props.index + 1}`
})

const itemDisabled = computed(() => props.disabled === true)
</script>

