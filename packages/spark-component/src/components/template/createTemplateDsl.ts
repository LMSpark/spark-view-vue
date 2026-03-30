import { computed, defineComponent, h } from 'vue'
import type { Component } from 'vue'
import type { SparkNode } from '../../core/types.js'
import SparkComponentRenderer from '../SparkComponentRenderer.vue'
import {
  buildTemplateNode,
  collectTemplateSlotChildren,
  markSparkTemplateNodeComponent,
} from '../support/SparkChild.shared.js'

/**
 * Factory: creates a template DSL component for a given container nodeType.
 *
 * The resulting component:
 * - Uses named slots (`#toolbar`, `#default`, `#actions`, …) → mapped to `dock` assignments
 * - All attrs become `SparkNode.props` (structural keys like `id`/`dock`/`order` go to the node root)
 * - Is marked as a `SparkTemplateNodeComponent` (nestable inside other DSL / SparkChild contexts)
 * - Renders through `SparkComponentRenderer`
 *
 * @example
 * ```ts
 * export const RTable = createTemplateDsl('r-table', 'RTable')
 * export const RForm  = createTemplateDsl('r-form', 'RForm')
 * ```
 */
export function createTemplateDsl(nodeType: string, displayName?: string): Component {
  const component = defineComponent({
    name: displayName ?? nodeType,
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      const node = computed<SparkNode>(() => {
        const children = collectTemplateSlotChildren(
          slots as unknown as Record<string, unknown>,
        )
        return buildTemplateNode(
          attrs as Record<string, unknown>,
          {
            descriptor: { nodeType },
            scope: `template:${nodeType}`,
            slotChildren: children,
          },
        )
      })
      return () => h(SparkComponentRenderer, { config: node.value })
    },
  })

  markSparkTemplateNodeComponent(component, { nodeType })
  return component
}
