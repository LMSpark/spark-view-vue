<template>
  <div v-if="isVisible" class="r-tour-wrapper">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-tour-child-${i}`"
      :config="child"
    />
    <el-tour
      v-model="isOpen"
      :show-arrow="showArrow"
      :placement="placement"
      :mask="mask"
      :type="tourType"
      :close-on-press-escape="closeOnPressEscape"
      :scroll-into-view-options="scrollIntoViewOptions"
      v-bind="$attrs"
      @close="handleClose"
      @finish="handleFinish"
      @change="handleChange"
    >
      <el-tour-step
        v-for="(step, idx) in steps"
        :key="idx"
        :target="step.target"
        :title="step.title"
        :description="step.description"
        :placement="step.placement"
        :mask="step.mask"
        :show-arrow="step.showArrow"
      />
    </el-tour>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-tour
 * @description 引导流程组件，基于 el-tour 定义多步骤引导目标和说明文字，管理引导打开/关闭状态。
 */
import { ref, watch, computed } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
} from '../../internal'
import type { RTourProps } from './RendererTour.props'

const props = withDefaults(defineProps<RTourProps>(), {
  type: 'r-tour',
  showArrow: true,
  mask: true,
  tourType: 'default',
  closeOnPressEscape: true,
})

const emit = defineEmits<{
  close: [current: number]
  finish: []
  change: [current: number]
  'update:open': [value: boolean]
}>()

const { isVisible } = useSparkPageComponent(props)

const children = computed(() => getSparkNodeChildren(props.children))

const isOpen = ref(props.open ?? false)

watch(() => props.open, (v) => {
  if (v !== undefined) isOpen.value = v
})

function handleClose(current: number) {
  isOpen.value = false
  emit('update:open', false)
  emit('close', current)
}

function handleFinish() {
  isOpen.value = false
  emit('update:open', false)
  emit('finish')
}

function handleChange(current: number) {
  emit('change', current)
}
</script>

<style scoped>
.r-tour-wrapper {
  display: contents;
}
</style>
