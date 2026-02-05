<template>
  <component
    :is="componentType"
    v-if="shouldRender"
    :class="nodeClass"
    v-bind="nodeProps"
    v-on="nodeEvents"
  >
    <!-- 文本内容 -->
    <template v-if="node.props?.text">
      {{ node.props.text }}
    </template>

    <!-- 递归渲染子节点 -->
    <DemoRenderer
      v-for="(child, index) in renderedChildren"
      :key="child.id || `child-${index}`"
      :node="child"
      :context="context"
    />
  </component>
</template>

<script setup lang="ts">
import { computed, inject, type Component } from 'vue'
import type { RenderNode, RenderContext } from './demo-config'
import { SPARK_MANAGER_KEY } from '@spark-view/spark-component'
import type { ComponentManager } from '@spark-view/spark-component'

interface Props {
  node: RenderNode
  context: RenderContext
}

const props = defineProps<Props>()

// 🎯 使用 SPARK 组件系统动态解析组件
const sparkManager = inject<ComponentManager>(SPARK_MANAGER_KEY)

// 组件类型映射（type → 注册的组件类型）
const componentTypeMap: Record<string, string> = {
  grid: 'user-grid',
  row: 'user-row',
  field: 'user-field',
  container: 'div'
}

// 获取组件类型
const componentType = computed<Component | string>(() => {
  const mappedType = componentTypeMap[props.node.type]
  if (!mappedType || mappedType === 'div') return 'div'
  
  // 通过 SPARK 组件系统动态解析组件
  const definition = sparkManager?.getComponentDefinition(mappedType)
  return definition?.component || 'div'
})

// 是否渲染（条件渲染）
const shouldRender = computed(() => {
  if (!props.node.condition) return true
  return props.node.condition(props.context)
})

// 组件 class
const nodeClass = computed(() => {
  if (!props.node.class) return undefined
  return Array.isArray(props.node.class) ? props.node.class : [props.node.class]
})

// 组件 props
const nodeProps = computed(() => {
  const baseProps = { ...props.node.props }
  
  // 对于 grid/row/field 组件，需要传递 config
  if (['grid', 'row', 'field'].includes(props.node.type)) {
    baseProps.config = {
      type: props.node.type,
      id: props.node.id || `${props.node.type}-${Math.random()}`,
      props: baseProps
    }
  }
  
  return baseProps
})

// 组件事件
const nodeEvents = computed(() => {
  return props.node.events || {}
})

// 渲染的子节点
const renderedChildren = computed(() => {
  // 静态子节点
  if (props.node.children) {
    return props.node.children
  }
  
  // 动态生成子节点
  if (props.node.childrenGenerator) {
    return props.node.childrenGenerator(props.context)
  }
  
  return []
})
</script>

<script lang="ts">
// 递归组件需要命名
export default {
  name: 'DemoRenderer'
}
</script>

<style scoped>
/* 样式由具体组件提供 */
</style>
