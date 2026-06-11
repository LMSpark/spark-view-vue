<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererTour
RendererTour 模块，属于 SPARK component container/layout-container。
组件目录: containers/layout。
该 DTS shard 当前不导出 ClassModel symbol。
-->
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
 * @description 引导流程组件，管理引导打开/关闭状态。
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
  /**
   * Tour closed; 用户关闭引导浮层。
   * @param current Current step index when closing.
   */
  close: [current: number]
  /** Tour finished; 用户完成所有引导步骤。 */
  finish: []
  /**
   * Tour step changed; 当前引导步骤发生切换。
   * @param current Next active step index.
   */
  change: [current: number]
  /**
   * Open state changed; 同步 tour 显隐状态。
   * @param value Next open state.
   */
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


