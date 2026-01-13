<template>
  <component
    :is="rendererComponent"
    :config="rule"
    :data="data"
    :parent-type="parentType"
    @update="handleUpdate"
  >
    <!-- 递归渲染子规则 -->
    <template v-if="rule.children && rule.children.length > 0">
      <EJ2DynamicRenderer
        v-for="(childRule, index) in rule.children"
        :key="index"
        :rule="childRule"
        :data="data"
        :parent-type="rule.type"
        @update="handleUpdate"
      />
    </template>
  </component>
</template>

<script lang="ts">
import { defineComponent, computed, type Component } from 'vue'
import { getEJ2Renderer } from './renderer-map'

const EJ2DynamicRenderer: Component = defineComponent({
  name: 'EJ2DynamicRenderer',
  props: {
    rule: {
      type: Object,
      required: true
    },
    data: Object,
    parentType: String
  },
  emits: ['update'],
  setup(props, { emit }) {
    const rendererComponent = computed(() => getEJ2Renderer(props.rule.type))
    
    const handleUpdate = (field: string, value: unknown) => {
      emit('update', field, value)
    }
    
    return {
      rendererComponent,
      handleUpdate
    }
  }
})

export default EJ2DynamicRenderer
</script>
