<template>
  <!-- 父组件：等待所有子组件就绪后才渲染 -->
  <div v-if="allChildrenReady" class="parent-component">
    <h3>{{ config.title }}</h3>

    <!-- 渲染子组件 -->
    <component
      v-for="(child, index) in config.children || []"
      :key="`child-${index}`"
      :is="getComponent(child.type)"
      :config="child"
      :parent-context="context"
      @ready="onChildReady"
    />

    <!-- 父组件内容 -->
    <div class="parent-content">
      所有子组件已就绪，父组件开始渲染！
    </div>
  </div>

  <!-- 加载状态 -->
  <div v-else class="loading">
    等待子组件初始化... ({{ readyChildrenCount }}/{{ totalChildrenCount }})
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'

interface Props {
  config: {
    type: string
    title?: string
    children?: any[]
  }
}

const props = defineProps<Props>()

const { context, provide, getComponent, logger } = useSparkComponent(props.config)

// 跟踪子组件就绪状态
const readyChildren = ref(new Set<string>())
const totalChildrenCount = computed(() => props.config.children?.length || 0)
const readyChildrenCount = computed(() => readyChildren.value.size)
const allChildrenReady = computed(() => readyChildrenCount.value === totalChildrenCount.value)

// 子组件就绪回调
const onChildReady = (childId: string) => {
  readyChildren.value.add(childId)
  logger.info(`子组件 ${childId} 已就绪`, {
    ready: readyChildrenCount.value,
    total: totalChildrenCount.value
  })
}

// 提供父组件状态给子组件
provide('parentStatus', {
  isParentReady: allChildrenReady,
  reportReady: (childId: string) => onChildReady(childId)
})

// 监听所有子组件就绪
watch(allChildrenReady, (ready) => {
  if (ready) {
    logger.info('🎉 所有子组件就绪，父组件开始渲染')
    // 这里可以执行父组件的初始化逻辑
    provide('parentInitialized', { initialized: true })
  }
})
</script>

<style scoped>
.parent-component {
  border: 2px solid #4CAF50;
  padding: 16px;
  margin: 8px;
}

.loading {
  border: 2px solid #FFC107;
  padding: 16px;
  margin: 8px;
  background: #FFF3CD;
}

.parent-content {
  background: #E8F5E8;
  padding: 12px;
  margin-top: 12px;
}
</style></content>
<parameter name="filePath">d:\SPARK_VIEW\features\spark\components\ParentWithChildren.vue