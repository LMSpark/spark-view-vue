<script lang="ts">
import { defineComponent, h, computed } from 'vue'
import { ElForm } from 'element-plus'

export default defineComponent({
  name: 'FormRenderer',
  props: {
    config: {
      type: Object,
      required: true
    },
    parentType: String,
    data: Object
  },
  emits: ['update'],
  setup(props, { slots }) {
    const formData = computed(() => props.data || {})
    
    return () => {
      return h(ElForm, {
        model: formData.value,
        labelWidth: props.config.labelWidth || '100px',
        labelPosition: props.config.labelPosition || 'right',
        class: 'form-renderer'
      }, slots.default)
    }
  }
})
</script>

<style scoped>
.form-renderer {
  width: 100%;
}
</style>
