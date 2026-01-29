<template>
  <div class="home">
    <header class="hero">
      <h1>SPARK 架构原型</h1>
      <p>基于 Vue 3 + EJ2 的原生组件开发</p>
    </header>

    <div class="features">
      <div class="feature-card" @click="navigateToProvideInject">
        <div class="feature-icon">🚀</div>
        <h3>主动provide/inject</h3>
        <p>Vue 3 Composition API 的上下文共享</p>
      </div>

      <div class="feature-card" @click="navigateToStackedColumns">
        <div class="feature-icon">📊</div>
        <h3>多级表头</h3>
        <p>EJ2 Grid 复杂表头结构</p>
      </div>

      <div class="feature-card" @click="navigateToTypeSafety">
        <div class="feature-icon">🔒</div>
        <h3>TypeScript类型安全</h3>
        <p>完整的类型定义和检查</p>
      </div>

      <div class="feature-card" @click="navigateToEJ2GridDemo">
        <div class="feature-icon">📊</div>
        <h3>EJ2 Grid组件演示</h3>
        <p>GridComponent + ColumnComponent 架构测试</p>
      </div>

      <div class="feature-card" @click="navigateToEJ2NativeDemo">
        <div class="feature-icon">🎯</div>
        <h3>EJ2 原生组件演示</h3>
        <p>直接使用 GridComponent 和 ColumnComponent</p>
      </div>

      <div class="feature-card" @click="navigateToSparkEJ2Demo">
        <div class="feature-icon">⚡</div>
        <h3>SPARK EJ2 组件演示</h3>
        <p>基于 SPARK 架构的 EJ2 组件，完全解耦的无限递归实现</p>
      </div>

      <div class="feature-card" @click="navigateToSparkDemo">
        <div class="feature-icon">🔗</div>
        <h3>SPARK 架构演示</h3>
        <p>验证能力继承和组件解耦的完整演示</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const navigateToProvideInject = () => {
  router.push('/provide-inject')
}

const navigateToStackedColumns = () => {
  router.push('/stacked-columns')
}

const navigateToTypeSafety = () => {
  router.push('/type-safety')
}

const navigateToEJ2GridDemo = () => {
  router.push('/ej2-grid-demo')
}

const navigateToEJ2NativeDemo = () => {
  router.push('/ej2-native-demo')
}

const navigateToSparkEJ2Demo = () => {
  router.push('/spark-ej2-demo')
}

const navigateToSparkDemo = () => {
  router.push('/spark-demo')
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.hero {
  text-align: center;
  padding: 4rem 2rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.hero h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
  font-weight: 700;
}

.hero p {
  font-size: 1.2rem;
  opacity: 0.9;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  padding: 4rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-card {
  background: rgba(255, 255, 255, 0.95);
  color: #333;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
  text-align: center;
}

.feature-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}

.feature-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.feature-card h3 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: #2c3e50;
}

.feature-card p {
  color: #7f8c8d;
  line-height: 1.6;
}
</style>