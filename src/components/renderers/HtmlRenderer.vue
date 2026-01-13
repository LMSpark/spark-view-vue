<template>
  <component
    :is="config.type"
    :class="config.class"
    :style="config.style"
    v-bind="htmlAttrs"
  >
    <!-- 默认插槽：渲染子节点 -->
    <slot />
  </component>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue'

/**
 * HtmlRenderer - 通用 HTML 元素渲染器 (Vue 3 模板版本)
 * 用于渲染 div, h1, h2, p, span 等普通 HTML 元素
 */
export default defineComponent({
  name: 'HtmlRenderer',
  props: {
    config: {
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
  setup(props) {
    // 提取 HTML 属性（排除 type, children, class, style）
    const htmlAttrs = computed(() => {
      const { type: _type, children: _children, class: _, style: __, ...attrs } = props.config
      return attrs
    })
    
    return {
      htmlAttrs
    }
  }
})
</script>
