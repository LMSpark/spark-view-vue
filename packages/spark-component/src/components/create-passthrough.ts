/**
 * 透传组件工厂 — 用 1 个函数替代 14+ 个零逻辑 .vue 包装文件。
 *
 * 每个 passthrough 组件的行为完全相同：
 *   1. `useSparkPageComponent(props)` 接入 SPARK 能力上下文
 *   2. `isVisible` 控制渲染
 *   3. 所有 attrs 透传到目标 el-* 组件
 *   4. `children` 递归渲染
 *
 * @module create-passthrough
 */
import { h, computed, defineComponent, resolveComponent, type Component } from 'vue'
import SparkComponentRenderer from './SparkComponentRenderer.vue'
import { getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNodeInput } from './internal.js'

/** 透传组件配置 */
interface PassthroughOptions {
  /** 属性重命名映射（包装层 prop → el-* prop），例如 `{ asideWidth: 'width' }` */
  propAliases?: Record<string, string>
  /** 属性默认值，key 为包装层 prop 名（alias 解析前），缺失时注入 */
  propDefaults?: Record<string, unknown>
}

/**
 * 创建一个透传渲染组件。
 *
 * @param elTag  - 目标 Element Plus 组件标签，如 `'el-row'`
 * @param type   - SPARK 注册类型名，如 `'r-row'`
 * @param options - 可选配置（属性别名等）
 */
export function createPassthrough(
  elTag: string,
  type: string,
  options?: PassthroughOptions,
): Component {
  const aliases = options?.propAliases
  const defaults = options?.propDefaults

  return defineComponent({
    name: `Passthrough_${type}`,
    inheritAttrs: false,
    props: {
      type: { type: String, default: type },
      children: { type: Array, default: undefined },
    },
    setup(props, { attrs }) {
      const { isVisible } = useSparkPageComponent(props as unknown as SparkNodeInput)
      const resolvedChildren = computed(() => getSparkNodeChildren(props.children as never))

      return () => {
        if (!isVisible.value) return null

        // 构建传给 el-* 的 attrs：注入默认值 → 别名重命名 → 透传
        let finalAttrs: Record<string, unknown> = attrs
        if (aliases) {
          const patched: Record<string, unknown> = {}
          // 先注入别名键的默认值（仅在 attrs 中缺失时）
          if (defaults) {
            for (const [key, def] of Object.entries(defaults)) {
              if (!(key in attrs)) {
                const mapped = aliases[key]
                patched[mapped ?? key] = def
              }
            }
          }
          for (const [key, value] of Object.entries(attrs)) {
            const mapped = aliases[key]
            patched[mapped ?? key] = value
          }
          finalAttrs = patched
        }

        const children = resolvedChildren.value
        if (children.length === 0) {
          return h(resolveComponent(elTag), finalAttrs)
        }

        const childVNodes = children.map((child, i) =>
          h(SparkComponentRenderer, { key: nodeId(child) ?? `${type}-child-${i}`, config: child }),
        )
        return h(resolveComponent(elTag), finalAttrs, { default: () => childVNodes })
      }
    },
  })
}
