<template>
  <div class="child-component">
    <h4>{{ config.name }}</h4>
    <div class="child-content">
      子组件内容：{{ config.data }}
    </div>
    <div class="status">
      状态：{{ isReady ? '✅ 已就绪' : '⏳ 初始化中...' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useSparkComponent } from '@spark-view/spark-core'

interface Props {
  config: {
    type: string
    name?: string
    data?: any
  }
}

const props = defineProps<Props>()

const { context, provide, consume, logger } = useSparkComponent(props.config)

// 子组件就绪状态
const isReady = ref(false)

// 模拟异步初始化（比如数据加载、API调用等）
const initializeChild = async () => {
  logger.info(`开始初始化子组件: ${props.config.name}`)

  // 模拟异步操作
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500))

  // 标记为就绪
  isReady.value = true

  // 通知父组件
  const parentStatus = consume('parentStatus')
  if (parentStatus?.reportReady) {
    parentStatus.reportReady(context.id)
  }

  logger.info(`子组件 ${props.config.name} 初始化完成`)
}

// 组件挂载后开始初始化
onMounted(async () => {
  await initializeChild()

  // 提供子组件能力给其他组件
  provide('childData', {
    name: props.config.name,
    data: props.config.data,
    isReady: isReady.value
  })
})

// 暴露就绪状态给父组件（通过事件）
defineEmits<{
  ready: [childId: string]
}>()

// 在下一个tick发出就绪事件（确保DOM已更新）
nextTick(() => {
  if (isReady.value) {
    // 这里可以发出事件，但我们主要通过能力系统通信
  }
})
</script>

<style scoped>
.child-component {
  border: 1px solid #2196F3;
  padding: 12px;
  margin: 8px;
  background: #E3F2FD;
}

.child-content {
  background: #BBDEFB;
  padding: 8px;
  margin: 8px 0;
}

.status {
  font-size: 0.9em;
  color: #666;
}
</style></content>
<parameter name="filePath">d:\SPARK_VIEW\features\spark\components\ChildComponent.vue