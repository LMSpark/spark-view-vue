<template>
  <div class="capability-demo">
    <h1>🎯 SPARK 组件系统演示</h1>
    <p class="subtitle">JSON 配置 + SparkComponentRenderer 递归渲染</p>

    <!-- SparkComponentRenderer 演示 -->
    <div class="spark-renderer-section">
      <h2>🎯 SparkComponentRenderer 递归渲染</h2>
      <p class="section-desc">使用 JSON 配置 + <code>@spark-view/spark-component</code> 的通用递归渲染器</p>
      <JsonRendererDemo />
    </div>
  </div>
</template>

<script setup lang="ts">
import JsonRendererDemo from '../components/demo/JsonRendererDemo.vue'
</script>

<style scoped>
.capability-demo {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

h1 {
  color: #2c3e50;
  margin-bottom: 8px;
}

.subtitle {
  color: #7f8c8d;
  font-size: 14px;
  margin-bottom: 30px;
}

.spark-renderer-section {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 30px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.spark-renderer-section h2 {
  margin-top: 0;
  color: white;
  font-size: 20px;
  margin-bottom: 8px;
}

.spark-renderer-section .section-desc {
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
  margin-bottom: 0;
}

.spark-renderer-section code {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Consolas', monospace;
}

.config-driven-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 30px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.config-driven-section h2 {
  margin-top: 0;
  color: white;
  font-size: 20px;
  margin-bottom: 8px;
}

.section-desc {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  margin-bottom: 20px;
  line-height: 1.5;
}

.model-level {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
  border: 2px solid #e9ecef;
}

.model-level h2 {
  margin-top: 0;
  color: #495057;
  font-size: 18px;
  margin-bottom: 8px;
}

.model-level .section-desc {
  color: #6c757d;
  margin-bottom: 16px;
}

.debug-panel {
  background: #fff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
}

.debug-panel h3 {
  margin-top: 0;
  color: #495057;
  font-size: 16px;
  margin-bottom: 16px;
}

.debug-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.debug-section h4 {
  font-size: 14px;
  color: #6c757d;
  margin-top: 0;
  margin-bottom: 12px;
}

.debug-section pre {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  margin: 0;
}

.event-log {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.log-item {
  display: grid;
  grid-template-columns: 80px 150px 1fr;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #e9ecef;
  font-size: 12px;
}

.log-item:last-child {
  border-bottom: none;
}

.log-time {
  color: #6c757d;
}

.log-event {
  color: #0d6efd;
  font-weight: 500;
}

.log-data {
  color: #495057;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
