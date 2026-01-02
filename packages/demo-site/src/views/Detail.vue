<template>
  <div class="detail-page">
    <div v-if="item" class="detail-container">
      <button class="back-button" @click="goBack">
        <span>←</span>
        返回列表
      </button>

      <div class="detail-header">
        <div class="detail-icon">{{ item.icon }}</div>
        <div class="detail-title-section">
          <h1>{{ item.title }}</h1>
          <div class="detail-meta">
            <span class="status" :class="item.status">{{ getStatusText(item.status) }}</span>
            <span class="date">📅 {{ item.date }}</span>
          </div>
        </div>
      </div>

      <div class="detail-content">
        <section class="section">
          <h2>📝 项目描述</h2>
          <p>{{ item.description }}</p>
        </section>

        <section class="section">
          <h2>🎯 核心功能</h2>
          <ul class="feature-list">
            <li v-for="(feature, index) in item.features" :key="index">
              <span class="feature-icon">✓</span>
              {{ feature }}
            </li>
          </ul>
        </section>

        <section class="section">
          <h2>💻 技术栈</h2>
          <div class="tech-stack">
            <span v-for="tech in item.techStack" :key="tech" class="tech-tag">
              {{ tech }}
            </span>
          </div>
        </section>

        <section class="section">
          <h2>📊 DSL 配置示例</h2>
          <pre class="code-block"><code>{{ item.dslExample }}</code></pre>
        </section>

        <section class="section">
          <h2>🚀 快速开始</h2>
          <div class="action-buttons">
            <router-link to="/editor" class="btn btn-primary">
              <span>✏️</span>
              在编辑器中打开
            </router-link>
            <button class="btn btn-secondary" @click="copyDsl">
              <span>📋</span>
              复制 DSL 代码
            </button>
          </div>
        </section>
      </div>
    </div>

    <div v-else class="not-found">
      <h1>404</h1>
      <p>项目未找到</p>
      <router-link to="/list" class="btn btn-primary">返回列表</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

interface DetailItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  status: 'active' | 'pending' | 'completed';
  date: string;
  features: string[];
  techStack: string[];
  dslExample: string;
}

const route = useRoute();
const router = useRouter();
const item = ref<DetailItem | null>(null);

// 模拟数据
const mockData: Record<number, DetailItem> = {
  1: {
    id: 1,
    title: 'SSR 渲染示例',
    description: '服务端渲染的完整示例，展示如何优化首屏性能和提升SEO效果',
    icon: '⚡',
    status: 'completed',
    date: '2026-01-01',
    features: [
      '服务端预渲染HTML，减少首屏白屏时间',
      'SEO友好，搜索引擎可直接抓取内容',
      '支持动态数据注入和表达式求值',
      '自动生成hydration脚本',
    ],
    techStack: ['Vue 3', 'SSR', 'YAML DSL', 'Node.js'],
    dslExample: `dslVersion: "1.0"
page:
  id: ssr-demo
  title: "SSR Demo"
  layout:
    type: container
    children:
      - type: text
        props:
          content: "{{ data.title }}"
data:
  title: "服务端渲染示例"`,
  },
  2: {
    id: 2,
    title: 'CSR 交互示例',
    description: '客户端渲染和动态交互的实现，展示完整的事件处理和状态管理',
    icon: '🎨',
    status: 'active',
    date: '2026-01-02',
    features: [
      '支持丰富的用户交互',
      '响应式数据绑定',
      '组件级状态管理',
      '事件处理和动画效果',
    ],
    techStack: ['Vue 3', 'Composition API', 'TypeScript'],
    dslExample: `dslVersion: "1.0"
page:
  id: csr-demo
  title: "CSR Demo"
  layout:
    type: button
    props:
      text: "点击计数"
      onClick: "handleClick()"
    hydration:
      strategy: immediate`,
  },
  3: {
    id: 3,
    title: '路由导航系统',
    description: 'Vue Router 集成和 SPA 导航的完整实现',
    icon: '🛣️',
    status: 'active',
    date: '2026-01-03',
    features: [
      '动态路由配置',
      '嵌套路由支持',
      '路由守卫和权限控制',
      '面包屑和导航组件',
    ],
    techStack: ['Vue Router 4', 'TypeScript', 'SPA'],
    dslExample: `dslVersion: "1.0"
routes:
  - path: /home
    name: home
    pageId: homePage
  - path: /detail/:id
    name: detail
    pageId: detailPage
navigation:
  header:
    type: navbar
    items:
      - label: 首页
        path: /home`,
  },
};

onMounted(() => {
  const id = parseInt(route.params.id as string);
  item.value = mockData[id] || null;
});

const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    active: '进行中',
    pending: '待开始',
    completed: '已完成',
  };
  return statusMap[status] || status;
};

const goBack = (): void => {
  router.push('/list');
};

const copyDsl = async (): Promise<void> => {
  if (item.value) {
    try {
      await navigator.clipboard.writeText(item.value.dslExample);
      alert('DSL 代码已复制到剪贴板！');
    } catch (err) {
      console.error('复制失败:', err);
    }
  }
};
</script>

<style scoped>
.detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
}

.detail-container {
  background: white;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f5f5f5;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 32px;
}

.back-button:hover {
  background: #e0e0e0;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding-bottom: 32px;
  border-bottom: 2px solid #f0f0f0;
  margin-bottom: 32px;
}

.detail-icon {
  font-size: 72px;
  flex-shrink: 0;
}

.detail-title-section h1 {
  margin: 0 0 12px;
  font-size: 32px;
  font-weight: 700;
  color: #333;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status {
  padding: 6px 16px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
}

.status.active {
  background: #e3f2fd;
  color: #2196f3;
}

.status.pending {
  background: #fff3e0;
  color: #ff9800;
}

.status.completed {
  background: #e8f5e9;
  color: #4caf50;
}

.date {
  font-size: 14px;
  color: #666;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #333;
}

.section p {
  font-size: 15px;
  line-height: 1.7;
  color: #666;
  margin: 0;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feature-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #333;
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #4caf50;
  color: white;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.tech-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tech-tag {
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
}

.code-block {
  margin: 0;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  overflow-x: auto;
}

.code-block code {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #333;
}

.action-buttons {
  display: flex;
  gap: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
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

.not-found {
  text-align: center;
  padding: 80px 20px;
}

.not-found h1 {
  font-size: 80px;
  font-weight: 700;
  margin: 0 0 16px;
  color: #667eea;
}

.not-found p {
  font-size: 20px;
  color: #666;
  margin: 0 0 32px;
}

@media (max-width: 768px) {
  .detail-container {
    padding: 24px;
  }

  .detail-header {
    flex-direction: column;
    text-align: center;
  }

  .detail-icon {
    font-size: 56px;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>