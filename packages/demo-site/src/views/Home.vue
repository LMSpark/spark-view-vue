<template>
  <div class="home-page">
    <section class="hero">
      <h1 class="hero-title">🚀 SPARK VIEW</h1>
      <p class="hero-subtitle">DSL驱动的现代化前端渲染框架</p>
      <p class="hero-description">
        支持SSR/CSR、组件化、响应式数据绑定、路由导航的下一代DSL框架
      </p>
      <div class="hero-actions">
        <router-link to="/editor" class="btn btn-primary">
          <span>✏️</span>
          开始使用
        </router-link>
        <a href="https://github.com/your-org/spark-view" target="_blank" class="btn btn-secondary">
          <span>⭐</span>
          GitHub
        </a>
      </div>
    </section>

    <section class="features">
      <h2>核心特性</h2>
      <div class="feature-grid">
        <div v-for="feature in features" :key="feature.title" class="feature-card">
          <div class="feature-icon">{{ feature.icon }}</div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </div>
      </div>
    </section>

    <section class="example">
      <h2>快速体验</h2>
      <div class="example-container">
        <div class="example-code">
          <pre v-pre><code>dslVersion: "1.0"
routes:
  - path: /home
    name: home
    pageId: homePage

pages:
  - id: homePage
    title: "首页"
    layout:
      type: container
      children:
        - type: text
          props:
            content: "{{ data.welcome }}"

data:
  welcome: "欢迎使用 SPARK VIEW！"</code></pre>
        </div>
        <div class="example-result">
          <div class="rendered-output">
            <p>{{ welcomeText }}</p>
            <router-link to="/editor" class="try-link">
              立即体验 →
            </router-link>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">

interface Feature {
  icon: string;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: '🎨',
    title: '可视化设计器',
    description: '集成 form-create-designer，拖拽式表单设计，无需编码',
  },
  {
    icon: '⚡',
    title: 'SSR/CSR 双模式',
    description: '支持服务端渲染和客户端渲染，灵活切换，优化首屏性能和SEO',
  },
  {
    icon: '🧩',
    title: '组件化架构',
    description: '基于组件树的DSL设计，支持循环、条件渲染和嵌套组件',
  },
  {
    icon: '🔄',
    title: '响应式数据',
    description: '基于Vue 3的响应式系统，数据变化自动更新视图',
  },
  {
    icon: '🛣️',
    title: '路由导航',
    description: '内置Vue Router，支持动态路由、嵌套路由和路由守卫',
  },
  {
    icon: '📦',
    title: '开箱即用',
    description: '完整的开发工具链，从设计到部署一键搞定',
  },
];

// 示例数据
const welcomeText = '欢迎使用 SPARK VIEW！';
</script>

<style scoped>
.home-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
}

.hero {
  text-align: center;
  padding: 80px 0;
}

.hero-title {
  font-size: 56px;
  font-weight: 800;
  margin: 0 0 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 24px;
  color: #333;
  margin: 0 0 12px;
  font-weight: 600;
}

.hero-description {
  font-size: 16px;
  color: #666;
  margin: 0 0 40px;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 32px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.btn-secondary {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
}

.btn-secondary:hover {
  background: #667eea;
  color: white;
}

.features {
  margin: 80px 0;
}

.features h2 {
  text-align: center;
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 48px;
  color: #333;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 32px;
}

.feature-card {
  padding: 32px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.feature-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.feature-card h3 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 12px;
  color: #333;
}

.feature-card p {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
  margin: 0;
}

.example {
  margin: 80px 0;
}

.example h2 {
  text-align: center;
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 48px;
  color: #333;
}

.example-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.example-code pre {
  margin: 0;
  padding: 24px;
  background: #f5f5f5;
  border-radius: 8px;
  overflow-x: auto;
}

.example-code code {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}

.example-result {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rendered-output {
  text-align: center;
}

.rendered-output p {
  font-size: 20px;
  font-weight: 600;
  color: #667eea;
  margin-bottom: 20px;
}

.try-link {
  display: inline-block;
  padding: 10px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  transition: all 0.3s;
}

.try-link:hover {
  transform: translateX(4px);
}

@media (max-width: 768px) {
  .example-container {
    grid-template-columns: 1fr;
  }

  .hero-title {
    font-size: 40px;
  }
}
</style>
