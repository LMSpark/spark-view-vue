<script lang="ts">
import { defineComponent, h, computed } from 'vue'
import { ElTable } from 'element-plus'

export default defineComponent({
  name: 'TableRenderer',
  props: {
    config: {
      type: Object,
      required: true
    },
    parentType: String,
    data: Object
  },
  setup(props, { slots }) {
    const tableData = computed(() => {
      if (!props.config.dataSource || !props.data) return []
      const keys = props.config.dataSource.split('.')
      let result = props.data
      for (const key of keys) {
        result = result?.[key]
        if (!result) return []
      }
      return Array.isArray(result) ? result : []
    })
    
    return () => {
      return h(ElTable, {
        data: tableData.value,
        border: props.config.border,
        stripe: props.config.stripe,
        class: 'table-renderer'
      }, slots.default)
    }
  }
})
</script>

<style scoped>
.table-renderer {
  width: 100%;
}
</style>
