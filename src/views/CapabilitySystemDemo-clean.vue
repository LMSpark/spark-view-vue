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
</style>
