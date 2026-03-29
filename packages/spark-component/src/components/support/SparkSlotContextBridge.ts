import { defineComponent, getCurrentInstance, onUnmounted } from 'vue'
import type { PropType } from 'vue'
import type { SparkCapabilityContext } from '../../core/types.js'
import { bindCapabilityContextOwner, unbindCapabilityContextOwner } from '../../internal/capability-context.js'

export default defineComponent({
  name: 'SparkSlotContextBridge',
  props: {
    parentContext: {
      type: Object as PropType<SparkCapabilityContext | undefined>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const currentInstance = getCurrentInstance()

    if (currentInstance !== null && props.parentContext !== undefined) {
      bindCapabilityContextOwner(currentInstance, props.parentContext)
      onUnmounted(() => {
        unbindCapabilityContextOwner(currentInstance)
      })
    }

    return () => slots['default']?.() ?? []
  },
})