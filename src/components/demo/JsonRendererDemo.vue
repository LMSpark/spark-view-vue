<template>
  <div style="background: white; padding: 20px; border-radius: 8px;">
    <h3>📋 JSON 配置驱动渲染</h3>
    
    <div v-if="loading">加载中...</div>
    <div v-else-if="error" style="color: red;">❌ 错误: {{ error }}</div>
    <div v-else>
      <!-- JSON 配置展示 -->
      <el-collapse style="margin-bottom: 20px;">
        <el-collapse-item title="📄 查看 JSON 配置" name="1">
          <pre style="background: #f5f5f5; padding: 10px; font-size: 12px; max-height: 300px; overflow: auto; border-radius: 4px;">{{ JSON.stringify(config, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
      
      <!-- 渲染结果 -->
      <div style="border-top: 1px solid #eee; padding-top: 20px;">
        <h4>✨ 渲染结果：</h4>
        <component :is="UserGrid" v-if="config" :config="config" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { useSparkComponent } from '@spark-view/spark-component'
import { Logger, APP_SERVICES } from '@spark-view/spark-utils'
import type { ComponentContext } from '@spark-view/spark-component'
import UserGrid from './UserGrid.vue'

const loading = ref(true)
const error = ref('')
const config = ref<Partial<ComponentContext> | null>(null)

const router = useRouter()
const logger = Logger('JsonRendererDemo')

const { provide: provideCapability } = useSparkComponent({
  type: 'json-renderer-demo-page',
  id: 'demo-page-root'
})

provideCapability(APP_SERVICES, {
  router: {
    push: (to: unknown) => router.push(to as RouteLocationRaw),
    replace: (to: unknown) => router.replace(to as RouteLocationRaw),
    back: () => router.back(),
    currentRoute: router.currentRoute.value
  },
  logger: {
    debug: (...args: unknown[]) => logger.debug(...args),
    info: (...args: unknown[]) => logger.info(...args),
    warn: (...args: unknown[]) => logger.warn(...args),
    error: (...args: unknown[]) => logger.error(...args)
  }
})

onMounted(async () => {
  try {
    const response = await fetch('/user-grid-demo.json')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    config.value = await response.json()
    loading.value = false
  } catch (e) {
    logger.error('加载配置失败:', e)
    error.value = e instanceof Error ? e.message : String(e)
    loading.value = false
  }
})
</script>
