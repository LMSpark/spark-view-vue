<!--
  ⚠️ DEPRECATED - 此组件已废弃
  
  此组件已迁移到 @spark-view/spark-component 包中作为标准组件。
  
  新代码请使用标准化的 JsonRenderer 组件：
  - 位置: packages/spark-component/src/renderer/JsonRenderer.vue
  - 导入: import { JsonRenderer } from '@spark-view/spark-component'
  - 文档: docs/guides/JSON_RENDERER_GUIDE.md
  - 迁移指南: docs/guides/JSON_RENDERER_MIGRATION.md
  - 新示例: src/components/demo/JsonRendererExample.vue
  
  保留此文件仅作为历史参考。
  迁移日期: 2026-02-21
-->
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
/**
 * JSON 渲染演示组件 - 配置驱动渲染示例
 * 
 * @deprecated 此组件已废弃，请使用 @spark-view/spark-component 中的 JsonRenderer
 * @see {@link packages/spark-component/src/renderer/JsonRenderer.vue}
 * @see {@link docs/guides/JSON_RENDERER_MIGRATION.md} 迁移指南
 * 
 * @component JsonRendererDemo
 * @description
 * 展示如何使用 JSON 配置文件驱动 SPARK 组件渲染。
 * 从远程加载 JSON 配置，通过 SparkComponentRenderer 动态渲染 UserGrid 组件。
 * 演示了 SPARK 系统的"零代码"配置化能力。
 * 
 * 核心功能：
 * 1. **配置加载**：从 /user-grid-demo.json 加载组件配置
 * 2. **动态渲染**：根据配置动态渲染 UserGrid 组件
 * 3. **配置展示**：可折叠的 JSON 配置查看器
 * 4. **能力提供**：提供 APP_SERVICES 能力（路由、日志）给子组件
 * 5. **错误处理**：优雅处理配置加载失败场景
 * 
 * @example
 * 配置文件格式 (/user-grid-demo.json):
 * ```json
 * {
 *   "type": "user-grid",
 *   "id": "demo-grid",
 *   "props": {
 *     "dataset": {
 *       "tables": {
 *         "Users": {
 *           "columns": [...],
 *           "rows": [...]
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
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
