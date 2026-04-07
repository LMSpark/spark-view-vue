<template>
  <el-image
    v-if="isVisible"
    :src="resolvedSrc"
    :fit="fit"
    :alt="alt"
    :lazy="lazy"
    :preview-src-list="resolvedPreviewList"
    :initial-index="initialIndex"
    :z-index="zIndex"
    :hide-on-click-modal="hideOnClickModal"
    :preview-teleported="previewTeleported"
    :close-on-press-escape="closeOnPressEscape"
    :style="imageStyle"
    v-bind="$attrs"
  >
    <template #placeholder>
      <slot name="placeholder">
        <div class="display-image-loading">加载中...</div>
      </slot>
    </template>
    <template #error>
      <slot name="error">
        <div class="display-image-error">
          <el-icon><Picture /></el-icon>
        </div>
      </slot>
    </template>
  </el-image>
</template>

<script setup lang="ts">
/**
 * @skill-description 图片展示组件，基于 el-image 显示图片，支持懒加载、预览画廊和加载占位。
 */
import { computed } from 'vue'
import { Picture } from '@element-plus/icons-vue'
import { useSparkPageComponent, type SparkNode } from '../../internal'
import { useDisplayDataSource } from '../composables/useDisplayDataSource'

interface Props extends SparkNode {
  /** 图片 URL（静态传入） */
  src?: string
  /** 字段名（从当前行读取 URL） */
  field?: string
  /** 静态值 */
  value?: string
  /** 图片适应模式 */
  fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
  /** 替代文本 */
  alt?: string
  /** 是否懒加载 */
  lazy?: boolean
  /** 预览图列表（静态传入） */
  previewSrcList?: string[]
  /** 预览图字段名（从当前行读取数组） */
  previewField?: string
  /** 初始预览索引 */
  initialIndex?: number
  /** 预览层级 */
  zIndex?: number
  /** 点击蒙层关闭预览 */
  hideOnClickModal?: boolean
  /** 预览传送至 body */
  previewTeleported?: boolean
  /** ESC 关闭预览 */
  closeOnPressEscape?: boolean
  /** 图片宽度 */
  width?: string | number
  /** 图片高度 */
  height?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'display-image',
  fit: 'cover',
  lazy: false,
  initialIndex: 0,
  hideOnClickModal: false,
  previewTeleported: true,
  closeOnPressEscape: true,
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedSrc = computed(() => {
  if (props.src) return props.src
  const v = dataValue.value
  if (typeof v === 'string') return v
  return undefined
})

const resolvedPreviewList = computed(() => {
  if (props.previewSrcList) return props.previewSrcList
  // 如果有 previewField，从当前行数据读取
  if (props.previewField) {
    const v = dataValue.value
    if (Array.isArray(v)) return v as string[]
  }
  // 单图时用自身 src 作为预览列表
  const src = resolvedSrc.value
  return src ? [src] : []
})

const imageStyle = computed(() => {
  const s: Record<string, string> = {}
  const w = props.width
  const h = props.height
  if (w) s['width'] = typeof w === 'number' ? `${w}px` : w
  if (h) s['height'] = typeof h === 'number' ? `${h}px` : h
  return s
})
</script>

<style scoped>
.display-image-loading,
.display-image-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}

.display-image-error .el-icon {
  font-size: 24px;
}
</style>
