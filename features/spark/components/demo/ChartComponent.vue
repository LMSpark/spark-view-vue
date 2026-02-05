<template>
  <div class="chart-component">
    <h3>📊 图表组件</h3>
    <p>{{ message }}</p>
    <div class="chart-container">
      <div class="bar-chart">
        <div 
          v-for="(bar, index) in chartData" 
          :key="index"
          class="bar"
          :style="{ height: bar.value + '%' }"
        >
          <span class="bar-label">{{ bar.label }}</span>
        </div>
      </div>
    </div>
    <div class="chart-info">
      <p>📈 这是一个模拟的图表组件（Chart.js / ECharts）</p>
      <p>⚡ 通过动态导入，只在需要时加载</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Props {
  message?: string
}

const props = withDefaults(defineProps<Props>(), {
  message: '图表组件已加载'
})

const chartData = ref([
  { label: 'Jan', value: 65 },
  { label: 'Feb', value: 80 },
  { label: 'Mar', value: 45 },
  { label: 'Apr', value: 90 },
  { label: 'May', value: 70 }
])

onMounted(() => {
  console.log('✅ ChartComponent 已挂载')
  // 模拟数据动画
  setTimeout(() => {
    chartData.value = chartData.value.map(item => ({
      ...item,
      value: Math.random() * 100
    }))
  }, 1000)
})
</script>

<style scoped>
.chart-component {
  padding: 20px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

h3 {
  margin: 0 0 15px 0;
  font-size: 24px;
}

.chart-container {
  background: rgba(255, 255, 255, 0.2);
  padding: 20px;
  border-radius: 8px;
  margin: 20px 0;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 200px;
  gap: 10px;
}

.bar {
  flex: 1;
  background: white;
  border-radius: 4px 4px 0 0;
  position: relative;
  min-height: 20px;
  transition: height 0.5s ease;
}

.bar-label {
  position: absolute;
  bottom: -25px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: white;
}

.chart-info {
  background: rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
}

.chart-info p {
  margin: 5px 0;
}
</style>
