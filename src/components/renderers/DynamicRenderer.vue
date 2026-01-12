<script lang="ts">
import { defineComponent, h } from 'vue'
import { getRenderer, isContainerType } from './renderer-map'

/**
 * DynamicRenderer - 动态渲染器核心组件 (Vue 3 渲染函数版本)
 * 使用 h 函数实现递归渲染
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
    return () => {
      const { rule, parentType, data } = props
      const rendererComponent = getRenderer(rule.type)
      
      // 渲染子节点
      const renderChildren = () => {
        if (!rule.children || !Array.isArray(rule.children)) {
          return []
        }
        
        return rule.children.map((child: any, idx: number) => {
          // 字符串直接返回
          if (typeof child === 'string') {
            return child
          }
          
          // 对象递归渲染
          return h(DynamicRenderer, {
            key: idx,
            rule: child,
            parentType: rule.type,
            data: data,
            onUpdate: (field: string, value: any) => {
              emit('update', field, value)
            }
          })
        })
      }
      
      // 渲染当前组件
      // 容器类型：传递 slot 函数渲染子组件
      // 非容器类型：如果有字符串子节点，也需要传递
      const children = rule.children?.length > 0 ? {
        default: () => {
          if (isContainerType(rule.type)) {
            return renderChildren()
          } else {
            // 非容器类型，只渲染字符串
            return rule.children.filter((c: any) => typeof c === 'string')
          }
        }
      } : undefined
      
      return h(
        rendererComponent,
        {
          config: rule,
          parentType: parentType,
          data: data,
          onUpdate: (field: string, value: any) => {
            emit('update', field, value)
          }
        },
        children
      )
    }
  }
})

export default DynamicRenderer
</script>
