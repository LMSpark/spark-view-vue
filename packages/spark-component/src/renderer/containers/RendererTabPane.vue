<template>
  <el-tab-pane
    :label="paneLabel"
    :name="paneName"
    :disabled="paneDisabled"
    :lazy="paneLazy"
    :closable="paneClosable"
  >
    <div :class="['renderer-tabs-pane-body', paneBodyClass]" :style="paneGridStyle">
      <template v-if="paneChildren.length">
        <div
          v-for="(child, childIndex) in paneChildren"
          :key="nodeId(child) ?? `r-tab-pane-child-${childIndex}`"
          class="renderer-tabs-pane-grid-item"
          :style="getPaneChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
      </template>
      <slot v-else />
    </div>
  </el-tab-pane>
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
  contentChildren: paneChildren,
  contentBodyClass: paneBodyClass,
  contentGridStyle: paneGridStyle,
  getContentChildGridStyle: getPaneChildGridStyle,
} = useCompositeItemGrid({ config: configRef })

const paneName = computed<string | number>(() => {
  const value = nodeInputProp(props.config, 'name') ?? nodeInputProp(props.config, 'value') ?? nodeId(props.config)
  return typeof value === 'string' || typeof value === 'number' ? value : `tab-${props.index}`
})

const paneLabel = computed(() => {
  const value = nodeInputProp(props.config, 'label') ?? nodeInputProp(props.config, 'title')
  return typeof value === 'string' && value.trim().length > 0 ? value : `标签页${props.index + 1}`
})

const paneDisabled = computed(() => nodeInputProp(props.config, 'disabled') === true)
const paneLazy = computed(() => nodeInputProp(props.config, 'lazy') === true)
const paneClosable = computed(() => nodeInputProp(props.config, 'closable') === true)
</script>