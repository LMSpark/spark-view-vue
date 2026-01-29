<template>
  <div class="app-container">
    <h1>SPARK 架构原型</h1>
    <p>能力分层 × 职责解耦 × 上下文契约</p>
    <div class="content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
// SPARK 架构原型应用入口
</script>

<style scoped>
.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  color: #2c3e50;
  text-align: center;
  margin-bottom: 10px;
}

p {
  text-align: center;
  color: #7f8c8d;
  font-size: 18px;
  margin-bottom: 40px;
}

.content {
  min-height: 400px;
}
</style>