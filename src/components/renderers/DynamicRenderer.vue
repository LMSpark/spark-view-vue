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
    // 🎯 根据 parentType 和 rule 属性推断实际类型
    const actualType = computed(() => {
      // 如果明确指定了 type，使用它
      if (props.rule.type) {
        return props.rule.type
      }
      
      // 🔑 关键逻辑：根据 parentType 推断子节点类型
      if (props.parentType === 'vxe-table' || props.parentType === 'vxe-grid') {
        // VXE Table 的子节点都是列
        return 'vxe-column'
      }

      if (props.parentType === 'vxe-stacked-column') {
        // 堆叠列的子节点也是列
        return 'vxe-column'
      }

      if (props.parentType === 'table') {
        // Element Plus Table 的子节点
        if (props.rule.field || props.rule.prop) {
          return 'text'  // 普通列
        }
      }

      // 默认：如果有 field 或 headerText，作为普通列处理
      if (props.rule.field || props.rule.headerText) {
        return 'text'
      }
      
      return props.rule.type || 'text'
    })
    
    const rendererComponent = computed(() => getRenderer(actualType.value))
    
    const isContainer = computed(() => isContainerType(actualType.value))
    
    const stringChildren = computed(() => {
      if (!props.rule.children || !Array.isArray(props.rule.children)) {
        return []
      }
      return props.rule.children.filter((c: any) => typeof c === 'string')
    })
    
    const handleUpdate = (field: string, value: any) => {
      emit('update', field, value)
    }
    
    if (import.meta.env.DEV && (actualType.value.startsWith('ej2-') || props.parentType?.startsWith('ej2-'))) {
      console.log('🎨 DynamicRenderer:', {
        originalType: props.rule.type,
        actualType: actualType.value,
        isContainer: isContainer.value,
        parentType: props.parentType,
        hasChildren: !!props.rule.children,
        childrenCount: props.rule.children?.length || 0,
        ruleKeys: Object.keys(props.rule)
      })
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
