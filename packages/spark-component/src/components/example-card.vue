<template>
  <div class="spark-example-card">
    <div class="component-header">
      <h3 class="component-title">{{ title }}</h3>
    </div>
    <div class="component-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'

interface ExampleCardConfig extends ComponentConfig {
  title?: string
}

interface Props {
  config: ExampleCardConfig
}

const props = defineProps<Props>()
const title = props.config.title ?? ''

// 使用SPARK组件hook
const { logger } = useSparkComponent(props.config)

// 组件初始化
logger.info('ExampleCard component mounted', { config: props.config })
</script>

<style scoped>
.spark-example-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  background: white;
}

.component-title {
  margin: 0 0 1rem 0;
  color: #2c3e50;
}
</style>