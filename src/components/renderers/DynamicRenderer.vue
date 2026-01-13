<template>
  <component
    :is="rendererComponent"
    :config="rule"
    :parent-type="parentType"
    :data="data"
    @update="handleUpdate"
  >
    <!-- 容器类型：递归渲染所有子节点 -->
    <template v-if="isContainer">
      <template v-for="(child, idx) in rule.children" :key="idx">
        <!-- 字符串子节点 -->
        <template v-if="typeof child === 'string'">{{ child }}</template>
        <!-- 对象子节点：递归渲染 -->
        <DynamicRenderer
          v-else
          :rule="child"
          :parent-type="rule.type"
          :data="data"
          @update="handleUpdate"
        />
      </template>
    </template>
    <!-- 非容器类型：只渲染字符串子节点 -->
    <template v-else>
      <template v-for="(child, idx) in stringChildren" :key="idx">
        {{ child }}
      </template>
    </template>
  </component>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue'
import { getRenderer, isContainerType } from './renderer-map'

/**
 * DynamicRenderer - 动态渲染器核心组件 (Vue 3 模板版本)
 * 使用模板和递归组件实现渲染
 */
const DynamicRenderer = defineComponent({
  name: 'DynamicRenderer',
  props: {
    rule: {
      type: Object,
      required: true
    },
    parentType: {
      type: String,
      default: ''
    },
    data: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ['update'],
  setup(props, { emit }) {
    const rendererComponent = computed(() => getRenderer(props.rule.type))
    
    const isContainer = computed(() => isContainerType(props.rule.type))
    
    const stringChildren = computed(() => {
      if (!props.rule.children || !Array.isArray(props.rule.children)) {
        return []
      }
      return props.rule.children.filter((c: any) => typeof c === 'string')
    })
    
    const handleUpdate = (field: string, value: any) => {
      emit('update', field, value)
    }
    
    return {
      rendererComponent,
      isContainer,
      stringChildren,
      handleUpdate
    }
  }
})

export default DynamicRenderer
</script>
