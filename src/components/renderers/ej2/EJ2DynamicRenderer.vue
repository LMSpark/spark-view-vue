<script lang="ts">
import { defineComponent, h, type Component } from 'vue'
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
    return () => {
      const RendererComponent = getEJ2Renderer(props.rule.type)
      
      // 准备传递给子渲染器的 props
      const rendererProps = {
        config: props.rule,
        data: props.data,
        parentType: props.parentType,
        onUpdate: (field: string, value: unknown) => emit('update', field, value)
      }
      
      // 如果有子规则，递归渲染
      const children = props.rule.children?.map((childRule: any) => 
        h(EJ2DynamicRenderer, {
          rule: childRule,
          data: props.data,
          parentType: props.rule.type,
          onUpdate: (field: string, value: unknown) => emit('update', field, value)
        })
      )
      
      return h(RendererComponent, rendererProps, children ? () => children : undefined)
    }
  }
})

export default EJ2DynamicRenderer
</script>
