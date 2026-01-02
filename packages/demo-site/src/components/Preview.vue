<template>
  <div class="preview">
    <div class="preview-header">
      <h3>👁️ 渲染预览</h3>
      <div class="mode-switch">
        <button
          :class="['mode-btn', { active: mode === 'ssr' }]"
          @click="$emit('change-mode', 'ssr')"
        >
          SSR
        </button>
        <button
          :class="['mode-btn', { active: mode === 'csr' }]"
          @click="$emit('change-mode', 'csr')"
        >
          CSR
        </button>
      </div>
    </div>

    <div class="preview-content">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="html" class="preview-html" v-html="html"></div>
      <div v-else class="preview-empty">
        <p>等待渲染...</p>
      </div>
    </div>

    <div class="preview-footer">
      <span class="mode-info">当前模式: {{ mode === 'ssr' ? '服务端渲染' : '客户端渲染' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  html: string;
  mode: 'ssr' | 'csr';
}>();

defineEmits<{
  (e: 'change-mode', mode: 'ssr' | 'csr'): void;
}>();
</script>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.preview-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.mode-switch {
  display: flex;
  gap: 4px;
  background: #e0e0e0;
  padding: 4px;
  border-radius: 6px;
}

.mode-btn {
  padding: 6px 16px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  transition: all 0.2s;
}

.mode-btn.active {
  background: white;
  color: #667eea;
  font-weight: 600;
}

.preview-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
  background: white;
}

.preview-html {
  min-height: 100%;
}

.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: 16px;
}

.preview-footer {
  padding: 12px 20px;
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
  font-size: 12px;
  color: #666;
}

.mode-info {
  font-weight: 500;
}
</style>
