import { defineComponent, getCurrentInstance, h, onUnmounted } from 'vue'
import type { PropType } from 'vue'
import type { SparkCapabilityContext, SparkNode } from '../../core/types.js'
import { nodeId } from '../../core/types.js'
import SparkComponentRenderer from '../SparkComponentRenderer.vue'
import { bindCapabilityContextOwner, unbindCapabilityContextOwner } from '../../internal/capability-context.js'

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
    // 统一上下文锚定：将容器的 context 绑定到 Bridge 自身实例。
    // 无论配置模式还是模板模式，子组件 walk parent chain 都能命中 Bridge。
    // 相比原方案（每个配置子节点单独包 SparkSlotContextBridge），
    // 只需 1 次 WeakMap 写入 + 1 个组件实例，消除 N 个冗余包裹层。
    const currentInstance = getCurrentInstance()
    if (currentInstance !== null && props.parentContext !== undefined) {
      bindCapabilityContextOwner(currentInstance, props.parentContext)
      onUnmounted(() => {
        unbindCapabilityContextOwner(currentInstance)
      })
    }

    return () => {
      const sparkChildren = normalizeSparkChildren(props.sparkChildren)

      // 配置模式：直接渲染 #spark slot 或 fallback SparkComponentRenderer。
      // 容器 context 已锚定在 Bridge 自身，子组件 walk 天然命中。
      if (sparkChildren.length > 0) {
        const sparkSlot = slots['spark']
        return sparkChildren.map((child, index) => {
          const key = nodeId(child) ?? `spark-child-${index}`
          if (sparkSlot !== undefined) {
            return sparkSlot({ child, index } as SparkSlotProps)
          }
          return h(SparkComponentRenderer, { key, config: child })
        })
      }

      // 模板模式：直接渲染 #default slot。
      // Bridge 自身已 bind context，slot children 的 Vue parent 是 Bridge，walk 命中。
      return slots['default']?.((props.slotScope as SlotScope | undefined) ?? EMPTY_SLOT_SCOPE) ?? []
    }
  },
})