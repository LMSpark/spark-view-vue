<template>
  <el-collapse-item
    :name="itemName"
    :title="itemTitle"
    :disabled="itemDisabled"
  >
    <div :class="['renderer-collapse-item-body', itemBodyClass]" :style="itemGridStyle">
      <template v-if="itemChildren.length">
        <div
          v-for="(child, childIndex) in itemChildren"
          :key="nodeId(child) ?? `r-collapse-item-child-${childIndex}`"
          class="renderer-collapse-grid-item"
          :style="getItemChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
      </template>
      <slot v-else />
    </div>
  </el-collapse-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkComponent } from '../_pkg'
import { nodeId, nodeInputProp, type SparkNode } from '../_pkg'
import { useCompositeItemGrid } from './useCompositeItemGrid'

interface Props {
  config: SparkNode
  index: number
}

const props = defineProps<Props>()

useSparkComponent(props.config)

const configRef = computed(() => props.config)
const {
  contentChildren: itemChildren,
  contentBodyClass: itemBodyClass,
  contentGridStyle: itemGridStyle,
  getContentChildGridStyle: getItemChildGridStyle,
} = useCompositeItemGrid({ config: configRef })

const itemName = computed<string | number>(() => {
  const value = nodeInputProp(props.config, 'name') ?? nodeId(props.config)
  return typeof value === 'string' || typeof value === 'number' ? value : `collapse-${props.index}`
})

const itemTitle = computed(() => {
  const value = nodeInputProp(props.config, 'title') ?? nodeInputProp(props.config, 'label')
  return typeof value === 'string' && value.trim().length > 0 ? value : `分组${props.index + 1}`
})

const itemDisabled = computed(() => nodeInputProp(props.config, 'disabled') === true)
</script>