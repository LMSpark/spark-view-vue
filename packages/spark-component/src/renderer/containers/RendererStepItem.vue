<template>
  <el-step
    v-if="mode === 'header'"
    :title="stepTitle"
    :description="stepDescription"
    :status="stepStatus"
    @click="emit('activate', index)"
  />

  <div v-else :class="['renderer-steps-content', stepBodyClass]" :style="stepGridStyle">
    <template v-if="stepChildren.length">
      <div
        v-for="(child, childIndex) in stepChildren"
        :key="nodeId(child) ?? `r-step-child-${childIndex}`"
        class="renderer-steps-grid-item"
        :style="getStepChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
    </template>
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkComponent } from '../_pkg'
import { nodeId, nodeInputProp, type SparkNode } from '../_pkg'
import { useCompositeItemGrid } from './useCompositeItemGrid'

interface Props {
  config: SparkNode
  index: number
  mode: 'header' | 'content'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  activate: [index: number]
}>()

useSparkComponent(props.config)

const configRef = computed(() => props.config)
const {
  contentChildren: stepChildren,
  contentBodyClass: stepBodyClass,
  contentGridStyle: stepGridStyle,
  getContentChildGridStyle: getStepChildGridStyle,
} = useCompositeItemGrid({ config: configRef })

const stepTitle = computed(() => {
  const value = nodeInputProp(props.config, 'title') ?? nodeInputProp(props.config, 'label')
  return typeof value === 'string' && value.trim().length > 0 ? value : `步骤${props.index + 1}`
})

const stepDescription = computed(() => {
  const description = nodeInputProp(props.config, 'description')
  return typeof description === 'string' ? description : ''
})

const stepStatus = computed<string | undefined>(() => {
  const status = nodeInputProp(props.config, 'status')
  return typeof status === 'string' ? status : undefined
})
</script>