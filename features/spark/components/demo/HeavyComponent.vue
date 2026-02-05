<template>
  <div class="heavy-component">
    <h3>🏋️ 重量级组件</h3>
    <p>{{ message }}</p>
    <p class="info">这是一个模拟的大型组件（假设 500KB）</p>
    <div class="feature-list">
      <h4>包含功能：</h4>
      <ul>
        <li>复杂数据可视化</li>
        <li>高级表格编辑</li>
        <li>实时数据同步</li>
        <li>富文本编辑器</li>
      </ul>
    </div>
    <div class="stats">
      <div class="stat">
        <span class="label">组件大小:</span>
        <span class="value">~500KB</span>
      </div>
      <div class="stat">
        <span class="label">加载时间:</span>
        <span class="value">{{ loadTime }}ms</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Props {
  message?: string
}

const props = withDefaults(defineProps<Props>(), {
  message: '重量级组件已加载'
})

const loadTime = ref(0)

onMounted(() => {
  // 记录加载时间
  loadTime.value = Math.random() * 500 + 200
  console.log('✅ HeavyComponent 已挂载')
})
</script>

<style scoped>
.heavy-component {
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

h3 {
  margin: 0 0 15px 0;
  font-size: 24px;
}

.info {
  background: rgba(255, 255, 255, 0.2);
  padding: 10px;
  border-radius: 6px;
  margin: 15px 0;
}

.feature-list {
  background: rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
  margin: 15px 0;
}

.feature-list h4 {
  margin: 0 0 10px 0;
}

.feature-list ul {
  margin: 0;
  padding-left: 20px;
}

.feature-list li {
  margin: 5px 0;
}

.stats {
  display: flex;
  gap: 20px;
  margin-top: 15px;
}

.stat {
  flex: 1;
  background: rgba(255, 255, 255, 0.2);
  padding: 10px;
  border-radius: 6px;
  text-align: center;
}

.label {
  display: block;
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 5px;
}

.value {
  display: block;
  font-size: 20px;
  font-weight: bold;
}
</style>
