<script lang="ts">
import { defineComponent, h } from 'vue'

/**
 * HtmlRenderer - 通用 HTML 元素渲染器 (Vue 3 渲染函数版本)
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
  render() {
    const { config } = this
    const { type, ...attrs } = config
    
    // 提取 HTML 属性（class, style 等）
    const htmlAttrs: any = {}
    if (attrs.class) htmlAttrs.class = attrs.class
    if (attrs.style) htmlAttrs.style = attrs.style
    
    // 处理其他属性
    Object.keys(attrs).forEach(key => {
      if (key !== 'class' && key !== 'style') {
        htmlAttrs[key] = attrs[key]
      }
    })
    
    // 渲染元素和子节点（子节点已由 DynamicRenderer 处理）
    return h(type, htmlAttrs, this.$slots.default?.())
  }
})
</script>
