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
import { ref, watch, computed } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  type SparkNode,
} from '../../internal'

interface TourStep {
  /** CSS 选择器或元素引用（运行时解析） */
  target?: string | HTMLElement | null
  /** 步骤标题 */
  title?: string
  /** 步骤描述 */
  description?: string
  /** 弹出位置 */
  placement?: string
  /** 是否显示遮罩 */
  mask?: boolean
  /** 是否显示箭头 */
  showArrow?: boolean
}

interface Props extends SparkNode {
  /** 步骤配置列表 */
  steps?: TourStep[]
  /** 是否显示 */
  open?: boolean
  /** 弹出位置（默认） */
  placement?: string
  /** 是否显示箭头 */
  showArrow?: boolean
  /** 是否显示遮罩 */
  mask?: boolean
  /** 引导类型 */
  tourType?: 'default' | 'primary'
  /** ESC 关闭 */
  closeOnPressEscape?: boolean
  /** 滚动选项 */
  scrollIntoViewOptions?: boolean | ScrollIntoViewOptions
}

const props = withDefaults(defineProps<Props>(), {
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
