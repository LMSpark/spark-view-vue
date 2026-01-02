<template>
  <div class="editor">
    <div class="editor-header">
      <h3>📝 DSL 编辑器</h3>
      <div class="actions">
        <button class="btn-secondary" @click="formatCode">格式化</button>
        <button class="btn-secondary" @click="copyCode">复制</button>
        <button class="btn-primary" @click="$emit('update')">渲染</button>
      </div>
    </div>
    
    <textarea
      v-model="content"
      class="editor-textarea"
      spellcheck="false"
      @input="handleInput"
    ></textarea>

    <div class="editor-footer">
      <span class="line-count">{{ lineCount }} 行</span>
      <span class="char-count">{{ charCount }} 字符</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update'): void;
}>();

const content = ref(props.modelValue);

watch(() => props.modelValue, (newVal) => {
  content.value = newVal;
});

const lineCount = computed(() => {
  return content.value.split('\n').length;
});

const charCount = computed(() => {
  return content.value.length;
});

const handleInput = () => {
  emit('update:modelValue', content.value);
};

const formatCode = () => {
  // 简单格式化（生产环境应使用 js-yaml）
  alert('格式化功能待实现（需要 js-yaml 格式化器）');
};

const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(content.value);
    alert('已复制到剪贴板');
  } catch (err) {
    alert('复制失败：' + err);
  }
};
</script>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.editor-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-secondary:hover {
  background: #d0d0d0;
}

.editor-textarea {
  flex: 1;
  padding: 20px;
  border: none;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  background: #fefefe;
  color: #333;
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 20px;
  padding: 12px 20px;
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
  font-size: 12px;
  color: #666;
}
</style>
