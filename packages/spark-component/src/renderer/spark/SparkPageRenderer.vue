<template>
  <div class="spark-json-renderer">
    <!-- 加载状态 -->
    <div v-if="loading" class="spark-json-renderer__loading">
      <slot name="loading">
        <div class="loading-content">
          <span class="loading-icon">⏳</span>
          <span>加载配置中...</span>
        </div>
      </slot>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="spark-json-renderer__error">
      <slot name="error" :error="error">
        <div class="error-content">
          <h3>❌ 配置加载失败</h3>
          <p>{{ error }}</p>
          <button @click="reload" class="retry-button">重试</button>
        </div>
      </slot>
    </div>

    <!-- 渲染结果 -->
    <div v-else class="spark-json-renderer__content">
      <!-- 配置查看器（调试用） -->
      <div v-if="showConfigViewer && config" class="config-viewer">
        <el-collapse>
          <el-collapse-item title="📄 查看 JSON 配置" name="config">
            <pre class="config-json">{{ JSON.stringify(config, null, 2) }}</pre>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- 主内容插槽 -->
      <slot name="content" :config="config">
        <!-- 默认渲染：使用传入的组件或从配置中查找 -->
        <component 
          v-if="config && renderComponent" 
          :is="renderComponent" 
          v-bind="(config['props'] as Record<string, unknown>) || {}"
          :config="config"
        />
        <div v-else-if="config" class="no-component-warning">
          ⚠️ 未找到匹配的组件：{{ config['type'] }}
        </div>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SparkPageRenderer - SPARK 原生页面渲染器
 *
 * 纯视图层：模板绑定 + props / slots / expose 声明。
 * 全部编排逻辑由 useJsonRenderer composable 承担。
 * 
 * @component
 * @example
 * ```vue
 * <!-- 远程加载配置 -->
 * <JsonRenderer configUrl="/user-grid-demo.json" />
 * 
 * <!-- 直接传入配置 -->
 * <JsonRenderer :config="{ type: 'user-grid', props: {...} }" />
 * 
 * <!-- 自定义组件 -->
 * <JsonRenderer :config="config" :component="UserGrid" />
 * 
 * <!-- 自定义插槽 -->
 * <SparkPageRenderer configUrl="/config.json">
 *   <template #loading>加载中...</template>
 *   <template #error="{ error }">错误：{{ error }}</template>
 *   <template #content="{ config }">
 *     <MyComponent :config="config" />
 *   </template>
 * </SparkPageRenderer>
 * ```
 */
import { computed, inject } from 'vue'
import type { Component } from 'vue'
import type { JsonRendererOptions } from '../types'
import { useJsonRenderer } from '../composables/useJsonRenderer'
import { SPARK_REGISTRY_KEY } from '../../core/types'
import type { ComponentRegistry } from '../../core/types'

// ==================== Props & Slots ====================

const props = withDefaults(defineProps<JsonRendererOptions>(), {
  showConfigViewer: false
})

// ==================== Composable ====================

const {
  loading,
  error,
  config,
  loadConfig,
  reload
} = useJsonRenderer(props)

// ==================== 组件解析 ====================

/**
 * 获取 SPARK 组件注册表
 */
const registry = inject<ComponentRegistry>(SPARK_REGISTRY_KEY)

/**
 * 解析要渲染的组件
 * 优先级：props.component > 从注册表查找 > null
 */
const renderComponent = computed<Component | null>(() => {
  // 1. 优先使用传入的组件
  if (props.component) {
    return props.component as Component
  }
  
  // 2. 从配置中获取 type，从注册表查找
  const configType = config.value?.['type']
  if (configType && typeof configType === 'string' && registry) {
    const componentDef = registry.get(configType)
    if (componentDef) {
      return componentDef.component as Component
    }
  }
  
  return null
})

// ==================== Expose ====================

defineExpose({
  reload,
  loadConfig,
  config
})
</script>

<style scoped>
.spark-json-renderer {
  width: 100%;
  min-height: 200px;
  background: white;
  border-radius: 8px;
  padding: 20px;
}

/* 加载状态 */
.spark-json-renderer__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #409eff;
  font-size: 14px;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.loading-icon {
  font-size: 32px;
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 错误状态 */
.spark-json-renderer__error {
  padding: 20px;
  color: #f56c6c;
}

.error-content h3 {
  margin: 0 0 10px;
  font-size: 16px;
}

.error-content p {
  margin: 0 0 15px;
  font-size: 14px;
}

.retry-button {
  padding: 8px 16px;
  background: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.retry-button:hover {
  background: #66b1ff;
}

/* 配置查看器 */
.config-viewer {
  margin-bottom: 20px;
}

.config-json {
  background: #f5f5f5;
  padding: 10px;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
  border-radius: 4px;
  margin: 0;
}

/* 渲染内容 */
.spark-json-renderer__content {
  width: 100%;
}

.no-component-warning {
  padding: 20px;
  background: #fff3cd;
  color: #856404;
  border: 1px solid #ffeaa7;
  border-radius: 4px;
  text-align: center;
}
</style>
