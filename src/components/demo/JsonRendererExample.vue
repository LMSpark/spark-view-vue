<!--
  JsonRenderer 使用示例 - 标准化后的 JSON 配置驱动渲染
  
  这个示例展示了如何使用标准化的 JsonRenderer 组件替代原来的 JsonRendererDemo。
  
  对比原始代码：
  - ✅ 移除了手动 fetch 配置的逻辑（由 JsonRenderer 内部处理）
  - ✅ 移除了 loading/error 状态管理（由 JsonRenderer 内部处理）
  - ✅ 移除了 APP_SERVICES 提供逻辑（由 JsonRenderer 内部处理）
  - ✅ 代码量从 100+ 行减少到 30 行
  - ✅ 标准化的插槽系统，更易于定制
  - ✅ 支持生命周期钩子，更强的扩展性
-->
<template>
  <div class="json-renderer-example">
    <h3>📋 JSON 配置驱动渲染（标准化版本）</h3>
    
    <!-- 基础用法：远程加载配置 -->
    <JsonRenderer 
      configUrl="/user-grid-demo.json"
      :component="UserGrid"
      show-config-viewer
    >
      <!-- 自定义加载状态 -->
      <template #loading>
        <div class="custom-loading">
          <span>⏳ 正在加载用户配置...</span>
        </div>
      </template>
      
      <!-- 自定义错误状态 -->
      <template #error="{ error }">
        <div class="custom-error">
          <h4>❌ 配置加载失败</h4>
          <p>{{ error }}</p>
          <button @click="reloadConfig">重试</button>
        </div>
      </template>
    </JsonRenderer>
  </div>
</template>

<script setup lang="ts">
/**
 * JSON 渲染器示例 - 标准化版本
 * 
 * @description
 * 展示如何使用标准化的 JsonRenderer 组件从 JSON 配置渲染 SPARK 组件。
 * 相比原始的 JsonRendererDemo，这个版本：
 * 1. 使用标准化的 @spark-view/spark-component 包中的 JsonRenderer
 * 2. 自动处理配置加载、错误处理、能力提供等通用逻辑
 * 3. 提供更灵活的插槽和钩子系统
 * 4. 代码更简洁、可维护性更强
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
import { ref } from 'vue'
import { SparkPageRenderer as JsonRenderer } from '@spark-view/spark-component'
import UserGrid from './UserGrid.vue'

const rendererRef = ref<InstanceType<typeof JsonRenderer> | null>(null)

/**
 * 重新加载配置
 */
function reloadConfig() {
  rendererRef.value?.reload()
}
</script>

<style scoped>
.json-renderer-example {
  background: white;
  padding: 20px;
  border-radius: 8px;
}

.json-renderer-example h3 {
  margin: 0 0 20px;
  color: #333;
}

.custom-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  font-size: 16px;
  color: #409eff;
}

.custom-error {
  padding: 20px;
  background: #fff3f3;
  border: 1px solid #ffc0c0;
  border-radius: 4px;
}

.custom-error h4 {
  margin: 0 0 10px;
  color: #f56c6c;
}

.custom-error p {
  margin: 0 0 15px;
  color: #666;
}

.custom-error button {
  padding: 8px 16px;
  background: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.custom-error button:hover {
  background: #66b1ff;
}
</style>
