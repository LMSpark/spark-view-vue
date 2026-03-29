import { defineComponent, h } from 'vue'
import type { PropType, Slot } from 'vue'
import type { SparkCapabilityContext, SparkNode } from '../../core/types.js'
import { nodeId } from '../../core/types.js'
import SparkComponentRenderer from '../SparkComponentRenderer.vue'
import SparkSlotContextBridge from './SparkSlotContextBridge.js'

type SlotScope = Record<string, unknown>

interface SparkSlotProps {
  child: SparkNode
  index: number
}

const EMPTY_SLOT_SCOPE = Object.freeze({}) as SlotScope

function normalizeSparkChildren(children: SparkNode[] | undefined): SparkNode[] {
  if (!Array.isArray(children) || children.length === 0) return []
  return children
}

function renderSparkSlot(
  slot: Slot | undefined,
  props: SparkSlotProps,
  parentContext: SparkCapabilityContext | undefined,
  fallback: () => unknown,
) {
  return h(
    SparkSlotContextBridge,
    {
      key: nodeId(props.child) ?? `spark-child-${props.index}`,
      parentContext,
    },
    {
      default: () => slot?.(props) ?? fallback(),
    },
  )
}

export default defineComponent({
  name: 'SparkChildrenBridge',
  props: {
    sparkChildren: {
      type: Array as PropType<SparkNode[] | undefined>,
      default: undefined,
    },
    parentContext: {
      type: Object as PropType<SparkCapabilityContext | undefined>,
      default: undefined,
    },
    slotScope: {
      type: Object as PropType<object | undefined>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    return () => {
      const sparkChildren = normalizeSparkChildren(props.sparkChildren)
      if (sparkChildren.length > 0) {
        return sparkChildren.map((child, index) => renderSparkSlot(
          slots['spark'],
          { child, index },
          props.parentContext,
          () => h(SparkComponentRenderer, {
            key: nodeId(child) ?? `spark-child-${index}`,
            config: child,
          }),
        ))
      }

      return h(SparkSlotContextBridge, {
        parentContext: props.parentContext,
      }, {
        default: () => slots['default']?.((props.slotScope as SlotScope | undefined) ?? EMPTY_SLOT_SCOPE) ?? [],
      })
    }
  },
})