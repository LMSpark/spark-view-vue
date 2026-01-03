<template>
  <div class="hybrid-demo">
    <div class="demo-header">
      <h1>🚀 混合架构演示</h1>
      <p class="subtitle">SSR首屏 + SPA导航 = 极致性能</p>
    </div>

    <div class="demo-controls">
      <div class="control-group">
        <label>
          <input type="checkbox" v-model="useMock" />
          使用 Mock 模式（无需后端）
        </label>
      </div>

      <div class="control-group">
        <label>DSL ID:</label>
        <input v-model="dslId" type="text" placeholder="输入DSL ID" :disabled="useMock" />
      </div>

      <div class="control-group">
        <label>当前路径:</label>
        <div class="path-selector">
          <input v-model="currentPath" type="text" placeholder="/about" />
          <div class="quick-paths">
            <button @click="currentPath = '/'" class="quick-btn" :class="{ active: currentPath === '/' }">
              🏠 首页
            </button>
            <button @click="currentPath = '/about'" class="quick-btn" :class="{ active: currentPath === '/about' }">
              ℹ️ 关于
            </button>
            <button @click="currentPath = '/contact'" class="quick-btn" :class="{ active: currentPath === '/contact' }">
              📧 联系
            </button>
          </div>
        </div>
      </div>

      <div class="control-group" v-if="!useMock">
        <label>API地址:</label>
        <input v-model="apiBaseUrl" type="text" placeholder="http://localhost:3000" />
      </div>

      <button @click="loadSSRContent" class="btn-primary">
        {{ useMock ? '加载 Mock 数据' : '加载SSR内容' }}
      </button>

      <button @click="uploadDSL" class="btn-secondary" v-if="!useMock">
        上传示例DSL
      </button>
    </div>

    <div v-if="loading" class="loading">
      ⏳ 加载中...
    </div>

    <div v-if="error" class="error">
      ❌ {{ error }}
    </div>

    <div v-if="renderData" class="demo-result">
      <div v-if="useMock" class="mock-badge">
        🎭 Mock 模式 - 无需后端服务
      </div>

      <div class="result-section">
        <h3>📄 SSR首屏HTML</h3>
        <pre>{{ renderData.html.substring(0, 500) }}{{ renderData.html.length > 500 ? '...' : '' }}</pre>
        <div class="stats">
          <span v-if="renderData.meta.mode">模式: {{ renderData.meta.mode }}</span>
          <span>缓存命中: {{ renderData.meta.cacheHit ? '✅' : '❌' }}</span>
          <span>时间戳: {{ new Date(renderData.meta.timestamp).toLocaleTimeString() }}</span>
        </div>
      </div>

      <div class="result-section">
        <h3>🗺️ 路由配置</h3>
        <pre>{{ renderData.routerConfig ? renderData.routerConfig.substring(0, 300) + '...' : '无' }}</pre>
      </div>

      <div class="result-section">
        <h3>📦 懒加载组件</h3>
        <ul>
          <li v-for="(url, name) in renderData.lazyComponents" :key="name">
            <strong>{{ name }}</strong>: {{ url }}
          </li>
          <li v-if="Object.keys(renderData.lazyComponents).length === 0" class="empty">
            无懒加载组件
          </li>
        </ul>
      </div>

      <div class="result-section">
        <h3>📊 初始数据</h3>
        <pre>{{ JSON.stringify(renderData.initialData, null, 2) }}</pre>
      </div>
    </div>

    <div class="architecture-diagram">
      <h3>🏗️ 混合架构流程</h3>
      <div class="diagram">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <strong>首次访问</strong>
            <p>浏览器请求 /about</p>
          </div>
        </div>
        <div class="arrow">↓</div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <strong>SSR渲染</strong>
            <p>API返回HTML+路由</p>
          </div>
        </div>
        <div class="arrow">↓</div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <strong>Hydration</strong>
            <p>Vue接管SSR内容</p>
          </div>
        </div>
        <div class="arrow">↓</div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-content">
            <strong>SPA导航</strong>
            <p>后续无刷新切换</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const dslId = ref('hybrid-demo');
const currentPath = ref('/');
const apiBaseUrl = ref('http://localhost:3000');
const useMock = ref(true); // 默认使用 Mock 模式
const loading = ref(false);
const error = ref('');
const renderData = ref<any>(null);

// Mock DSL 数据
const mockDSL = {
  dslVersion: '1.0.0',
  name: 'SPARK VIEW 混合架构演示',
  data: {
    appName: 'SPARK VIEW',
    version: '1.0.0',
    description: '这是一个演示SSR首屏 + SPA导航的示例应用'
  },
  pages: [
    {
      id: 'home',
      title: '首页',
      components: [
        {
          type: 'section',
          props: { class: 'hero' },
          children: [
            { type: 'h1', content: '欢迎来到 {{appName}}' },
            { type: 'p', content: '版本: {{version}}' },
            { type: 'p', content: '{{description}}' }
          ]
        }
      ]
    },
    {
      id: 'about',
      title: '关于我们',
      components: [
        {
          type: 'section',
          children: [
            { type: 'h1', content: '关于 {{appName}}' },
            { type: 'p', content: '这是一个基于DSL的低代码平台' },
            { type: 'p', content: '特性：' },
            {
              type: 'ul',
              children: [
                { type: 'li', content: '⚡ SSR首屏渲染，TTFB < 100ms' },
                { type: 'li', content: '🚀 SPA流畅导航，无刷新体验' },
                { type: 'li', content: '📦 按需编译，智能缓存' },
                { type: 'li', content: '🔧 页面级更新，开发高效' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'contact',
      title: '联系我们',
      components: [
        {
          type: 'section',
          children: [
            { type: 'h1', content: '联系方式' },
            { type: 'p', content: '邮箱: support@sparkview.dev' },
            { type: 'p', content: '微信: sparkview-support' },
            { type: 'p', content: 'GitHub: github.com/sparkview' }
          ]
        }
      ]
    }
  ],
  routes: [
    { path: '/', name: 'home', pageId: 'home', meta: { title: '首页' } },
    { path: '/about', name: 'about', pageId: 'about', meta: { title: '关于我们' } },
    { path: '/contact', name: 'contact', pageId: 'contact', meta: { title: '联系我们' } }
  ],
  navigation: {
    type: 'header',
    items: [
      { label: '首页', path: '/' },
      { label: '关于', path: '/about' },
      { label: '联系', path: '/contact' }
    ]
  },
  router: {
    mode: 'history',
    base: '/'
  }
};

// Mock 编译器 - 简单的 HTML 生成
function mockCompile(dsl: any, path: string) {
  const route = dsl.routes.find((r: any) => r.path === path);
  if (!route) {
    throw new Error('路由不存在');
  }

  const page = dsl.pages.find((p: any) => p.id === route.pageId);
  if (!page) {
    throw new Error('页面不存在');
  }

  // 简单的模板替换
  const replaceVars = (text: string, data: any) => {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
  };

  // 递归渲染组件
  const renderComponent = (comp: any, data: any): string => {
    const content = comp.content ? replaceVars(comp.content, data) : '';
    const children = comp.children 
      ? comp.children.map((c: any) => renderComponent(c, data)).join('\n')
      : '';
    
    if (comp.type === 'section') {
      return `<section class="${comp.props?.class || ''}">\n${children}\n</section>`;
    } else if (comp.type === 'h1') {
      return `<h1>${content}</h1>`;
    } else if (comp.type === 'p') {
      return `<p>${content}</p>`;
    } else if (comp.type === 'ul') {
      return `<ul>\n${children}\n</ul>`;
    } else if (comp.type === 'li') {
      return `<li>${content}</li>`;
    }
    return content + children;
  };

  const html = page.components
    .map((comp: any) => renderComponent(comp, dsl.data))
    .join('\n');

  // 生成路由配置代码
  const routerConfig = `export default ${JSON.stringify(dsl.routes, null, 2)}`;

  // 生成懒加载组件映射
  const lazyComponents: Record<string, string> = {};
  dsl.pages.forEach((p: any) => {
    if (p.id !== route.pageId) {
      lazyComponents[p.id] = `/mock/component/${p.id}`;
    }
  });

  return {
    html: `<div id="app" class="page-${route.pageId}">\n${html}\n</div>`,
    routerConfig,
    lazyComponents,
    initialData: {
      currentPath: path,
      dslId: 'mock-dsl',
      pageId: route.pageId,
      pageTitle: page.title
    },
    meta: {
      cacheHit: false,
      timestamp: Date.now(),
      mode: 'mock'
    }
  };
}

async function loadSSRContent() {
  loading.value = true;
  error.value = '';
  renderData.value = null;

  try {
    if (useMock.value) {
      // Mock 模式
      await new Promise(resolve => setTimeout(resolve, 500)); // 模拟网络延迟
      renderData.value = mockCompile(mockDSL, currentPath.value);
    } else {
      // 真实 API 模式
      const url = `${apiBaseUrl.value}/api/render?dslId=${dslId.value}&path=${currentPath.value}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      renderData.value = await response.json();
    }
  } catch (err: any) {
    error.value = err.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function uploadDSL() {
  loading.value = true;
  error.value = '';

  try {
    // 读取示例DSL
    const dslResponse = await fetch('/example-hybrid.yaml');
    const dslText = await dslResponse.text();

    // 简单的YAML解析（实际应使用yaml库）
    const dslData = {
      dslVersion: '1.0.0',
      name: '混合架构示例',
      pages: [
        { id: 'home', title: '首页' },
        { id: 'about', title: '关于' },
        { id: 'contact', title: '联系' }
      ],
      routes: [
        { path: '/', name: 'home', pageId: 'home' },
        { path: '/about', name: 'about', pageId: 'about' },
        { path: '/contact', name: 'contact', pageId: 'contact' }
      ]
    };

    // 上传到API
    const response = await fetch(`${apiBaseUrl.value}/api/dsl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: dslId.value,
        dsl: dslData
      })
    });

    if (!response.ok) {
      throw new Error(`上传失败: ${response.statusText}`);
    }

    alert('✅ DSL上传成功！现在可以加载SSR内容了');
  } catch (err: any) {
    error.value = err.message || '上传失败';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.hybrid-demo {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.demo-header {
  text-align: center;
  margin-bottom: 2rem;
}

.demo-header h1 {
  font-size: 2.5rem;
  color: #667eea;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  font-size: 1.1rem;
}

.demo-controls {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 2rem;
}

.control-group {
  margin-bottom: 1rem;
}

.control-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #333;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-group input[type="checkbox"] {
  width: auto;
  cursor: pointer;
}

.control-group input[type="text"] {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 4px;
  font-size: 1rem;
}

.control-group input[type="text"]:disabled {
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}

.control-group input[type="text"]:focus {
  outline: none;
  border-color: #667eea;
}

.path-selector {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quick-paths {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.quick-btn {
  padding: 0.5rem 1rem;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  margin: 0;
}

.quick-btn:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.quick-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  margin-right: 1rem;
  margin-top: 1rem;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: #28a745;
  color: white;
}

.btn-secondary:hover {
  opacity: 0.9;
}

.loading {
  text-align: center;
  font-size: 1.5rem;
  padding: 2rem;
  color: #667eea;
}

.error {
  background: #fee;
  color: #c33;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.demo-result {
  display: grid;
  gap: 1.5rem;
  position: relative;
}

.mock-badge {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  text-align: center;
  font-weight: 600;
  font-size: 1.1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.result-section {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
}

.result-section h3 {
  margin-top: 0;
  color: #667eea;
}

.result-section pre {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.9rem;
  max-height: 200px;
  overflow-y: auto;
}

.stats {
  margin-top: 1rem;
  display: flex;
  gap: 1rem;
}

.stats span {
  background: #667eea;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

.result-section ul {
  list-style: none;
  padding: 0;
}

.result-section li {
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.result-section li.empty {
  color: #999;
  font-style: italic;
}

.architecture-diagram {
  margin-top: 2rem;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
}

.architecture-diagram h3 {
  color: #667eea;
  margin-top: 0;
}

.diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.step {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  width: 100%;
  max-width: 400px;
}

.step-number {
  background: white;
  color: #667eea;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.2rem;
}

.step-content {
  flex: 1;
}

.step-content strong {
  display: block;
  margin-bottom: 0.25rem;
}

.step-content p {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.9;
}

.arrow {
  font-size: 2rem;
  color: #667eea;
}
</style>
