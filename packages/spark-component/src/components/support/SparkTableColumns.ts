import { defineComponent } from 'vue'

export default defineComponent({
  name: 'SparkTableColumns',
  setup(_, { slots }) {
    return () => slots['default']?.() ?? []
  },
})