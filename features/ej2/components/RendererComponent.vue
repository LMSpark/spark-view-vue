<script setup lang="ts">
/**
 * 统一递归组件渲染器 - 使用核心 registry 获取已注册组件以保持去耦
 */
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-core'
import type { SparkComponentConfig as ComponentConfig } from '@spark-view/spark-core' 

// 设置组件名以支持递归引用
defineOptions({ name: 'RendererComponent' })

// 主组件 Props
interface Props {
  config: ComponentConfig
}

const props = defineProps<Props>()

const { getComponent, isComponentRegistered, logger } = useSparkComponent(props.config)

import { resolveRendererForConfig, getChildrenForConfig } from '../../../packages/spark-core/src/utils/renderLogic'

const isRegistered = computed(() => isComponentRegistered(props.config.type))

const componentType = computed(() => resolveRendererForConfig(props.config, getComponent))

const componentProps = computed(() => ({ config: props.config }))

const childResults = computed(() => getChildrenForConfig(props.config))

if (logger && typeof logger.info === 'function') {
  logger.info('🎯 渲染组件:', { type: props.config.type, childrenCount: childResults.value.length, isRegistered: isRegistered.value })
}
</script>

<template>
  <!-- 动态组件渲染 -->
  <component
    :is="componentType"
    v-if="isRegistered"
    v-bind="componentProps"
  />

  <!-- 逻辑组件：没有注册渲染器但有子组件时，递归渲染子节点 -->
  <template v-else-if="childResults.length > 0">
    <RendererComponent
      v-for="(childConfig, index) in childResults"
      :key="`logic-child-${index}`"
      :config="childConfig"
    />
  </template>

  <!-- 未注册的组件类型（显示错误信息，便于排查） -->
  <div v-else class="error-component">
    ❌ 未注册或未知组件类型: {{ config.type }}
  </div>
</template>

<style scoped>
.error-component {
  color: red;
  padding: 10px;
  border: 1px solid red;
  background: #ffe6e6;
}
</style>