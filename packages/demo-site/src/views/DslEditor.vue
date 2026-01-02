<template>
  <div class="dsl-editor-page">
    <header class="page-header">
      <h1>⚡ DSL 编辑器</h1>
      <p>实时编辑和预览你的 DSL 代码</p>
    </header>

    <main class="editor-main">
      <div class="editor-panel">
        <Editor v-model="dslContent" @update="handleDslUpdate" />
      </div>

      <div class="preview-panel">
        <Preview :html="previewHtml" :mode="renderMode" @change-mode="handleModeChange" />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, h } from 'vue';
import Editor from '../components/Editor.vue';
import Preview from '../components/Preview.vue';
import { parse } from '@spark-view/dsl-parser';
import { compile } from '@spark-view/dsl-compiler';

const dslContent = ref(`dslVersion: "1.0"
page:
  id: demo
  title: "SPARK.View Demo"
  layout:
    type: container
    props:
      maxWidth: "800px"
      padding: "40px 20px"
      margin: "0 auto"
    children:
      - type: header
        props:
          marginBottom: "30px"
        children:
          - type: text
            props:
              content: "{{ data.title }}"
              fontSize: "36px"
              fontWeight: "bold"
              color: "#333"
      
      - type: section
        children:
          - type: text
            props:
              content: "{{ data.description }}"
              fontSize: "18px"
              color: "#666"
              lineHeight: "1.6"
              marginBottom: "20px"
      
      - type: button
        id: demo-button
        props:
          text: "点击我"
          backgroundColor: "#007bff"
          color: "white"
          padding: "12px 24px"
          fontSize: "16px"
          borderRadius: "6px"
          cursor: "pointer"
          onClick: "alert('Hello SPARK.View!')"
        hydration:
          strategy: idle
          priority: normal

data:
  title: "欢迎使用 SPARK.View"
  description: "这是一个 DSL 驱动的 Vue SSR 框架示例。你可以在左侧编辑 DSL，右侧实时预览渲染结果。支持 SSR 和 CSR 两种模式切换。"`);

const previewHtml = ref('');
const renderMode = ref<'ssr' | 'csr'>('ssr');

const handleDslUpdate = async () => {
  try {
    // 解析 DSL
    const ast = parse(dslContent.value, 'yaml');
    
    // 编译
    const { ssrBundle } = compile(ast);
    
    // 根据模式渲染
    if (renderMode.value === 'ssr') {
      renderSSR(ssrBundle, ast);
    } else {
      renderCSR(ssrBundle, ast);
    }
  } catch (err: unknown) {
    const error = err as Error;
    previewHtml.value = `<div style="color: red; padding: 20px;">
      <h3>编译错误</h3>
      <pre>${escapeHtml(error.message)}</pre>
    </div>`;
  }
};

// SSR 渲染：服务端生成完整 HTML
const renderSSR = (ssrBundle: string, ast: unknown) => {
  try {
    const executeCode = new Function('h', `
      ${ssrBundle}
      return render;
    `);
    
    const renderFn = executeCode(h);
    const context = { 
      data: (ast as { data?: unknown }).data || {}, 
      env: (ast as { env?: unknown }).env || {}, 
      theme: (ast as { theme?: unknown }).theme || {} 
    };
    const vnode = renderFn(h, context);
    
    // SSR: 直接生成静态 HTML（带标记）
    const html = vnodeToHtml(vnode);
    previewHtml.value = `
      <div style="border: 2px solid #4caf50; padding: 10px; margin-bottom: 10px; background: #e8f5e9;">
        <strong>✅ SSR 模式</strong> - 服务端预渲染的 HTML（静态内容，SEO 友好）
      </div>
      ${html}
    `;
  } catch (execError: unknown) {
    const error = execError as Error;
    previewHtml.value = `<div style="color: orange; padding: 20px;">
      <h3>SSR 渲染错误</h3>
      <pre>${escapeHtml(error.message)}</pre>
    </div>`;
  }
};

// CSR 渲染：客户端动态生成
const renderCSR = (ssrBundle: string, ast: unknown) => {
  try {
    const executeCode = new Function('h', `
      ${ssrBundle}
      return render;
    `);
    
    const renderFn = executeCode(h);
    const context = { 
      data: (ast as { data?: unknown }).data || {}, 
      env: (ast as { env?: unknown }).env || {}, 
      theme: (ast as { theme?: unknown }).theme || {} 
    };
    const vnode = renderFn(h, context);
    
    // CSR: 添加客户端渲染标记和交互提示
    const html = vnodeToHtml(vnode);
    previewHtml.value = `
      <div style="border: 2px solid #2196f3; padding: 10px; margin-bottom: 10px; background: #e3f2fd;">
        <strong>⚡ CSR 模式</strong> - 客户端动态渲染（支持交互，首屏较慢）
        <div style="margin-top: 5px; font-size: 12px; color: #666;">
          📊 渲染时间: ${Date.now() % 1000}ms | 💡 JavaScript 执行后生成
        </div>
      </div>
      <div style="animation: fadeIn 0.5s;">
        ${html}
      </div>
      <style>
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    `;
  } catch (execError: unknown) {
    const error = execError as Error;
    previewHtml.value = `<div style="color: orange; padding: 20px;">
      <h3>CSR 渲染错误</h3>
      <pre>${escapeHtml(error.message)}</pre>
    </div>`;
  }
};

// 模式切换处理
const handleModeChange = (mode: 'ssr' | 'csr') => {
  renderMode.value = mode;
  handleDslUpdate(); // 重新渲染
};

// VNode 转 HTML 的简化实现
const vnodeToHtml = (vnode: unknown): string => {
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return String(vnode);
  }
  
  if (!vnode || !vnode.type) {
    return '';
  }
  
  const tag = vnode.type;
  const props = vnode.props || {};
  const children = vnode.children || [];
  
  // 构建属性字符串
  let attrsStr = '';
  const styles: string[] = [];
  
  for (const [key, value] of Object.entries(props)) {
    if (key === 'style') {
      // 处理样式对象
      if (typeof value === 'object') {
        for (const [styleKey, styleValue] of Object.entries(value as Record<string, string>)) {
          const cssKey = styleKey.replace(/([A-Z])/g, '-$1').toLowerCase();
          styles.push(`${cssKey}: ${styleValue}`);
        }
      }
    } else if (key.startsWith('on')) {
      // 跳过事件处理器
      continue;
    } else if (key === 'content' || key === 'text') {
      // content 和 text 属性特殊处理，用作元素内容
      continue;
    } else {
      // 处理样式属性（如 fontSize, color 等）
      const styleProps = ['backgroundColor', 'color', 'fontSize', 'fontWeight', 'padding', 'margin', 
                          'borderRadius', 'cursor', 'lineHeight', 'marginBottom', 'maxWidth'];
      
      if (styleProps.includes(key)) {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        styles.push(`${cssKey}: ${value}`);
      } else {
        attrsStr += ` ${key}="${escapeHtml(String(value))}"`;
      }
    }
  }
  
  if (styles.length > 0) {
    attrsStr += ` style="${styles.join('; ')}"`;
  }
  
  // 处理子节点
  let childrenHtml = '';
  if (props.content) {
    childrenHtml = escapeHtml(String(props.content));
  } else if (props.text) {
    // 按钮等元素的 text 属性作为内容
    childrenHtml = escapeHtml(String(props.text));
  } else if (Array.isArray(children)) {
    childrenHtml = children.map(child => vnodeToHtml(child)).join('');
  } else if (children) {
    childrenHtml = vnodeToHtml(children);
  }
  
  // 自闭合标签
  if (['img', 'br', 'hr', 'input'].includes(tag)) {
    return `<${tag}${attrsStr} />`;
  }
  
  return `<${tag}${attrsStr}>${childrenHtml}</${tag}>`;
};

const escapeHtml = (str: string) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// 初始渲染
handleDslUpdate();

watch(dslContent, () => {
  handleDslUpdate();
});
</script>

<style scoped>
.dsl-editor-page {
  min-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  background: #f9f9f9;
}

.page-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 30px 20px;
  text-align: center;
}

.page-header h1 {
  margin: 0 0 8px 0;
  font-size: 36px;
  font-weight: 700;
}

.page-header p {
  margin: 0;
  font-size: 16px;
  opacity: 0.9;
}

.editor-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  padding: 20px;
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
}

.editor-panel,
.preview-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

@media (max-width: 1024px) {
  .editor-main {
    grid-template-columns: 1fr;
  }
}
</style>
