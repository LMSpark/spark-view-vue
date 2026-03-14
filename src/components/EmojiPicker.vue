<template>
  <el-popover trigger="click" :width="280" placement="bottom-start">
    <template #reference>
      <el-button class="emoji-trigger" :style="{ width: width + 'px' }">
        <span v-if="modelValue" class="emoji-preview">{{ modelValue }}</span>
        <span v-else class="emoji-placeholder">{{ placeholder }}</span>
      </el-button>
    </template>
    <div class="emoji-grid">
      <button
        v-for="emoji in emojis"
        :key="emoji"
        class="emoji-cell"
        :class="{ active: emoji === modelValue }"
        :title="emoji"
        @click="select(emoji)"
      >{{ emoji }}</button>
    </div>
    <div v-if="modelValue" class="emoji-footer">
      <el-button size="small" link type="danger" @click="select('')">清除</el-button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
interface Props {
  modelValue?: string
  placeholder?: string
  width?: number
}

withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '选择图标',
  width: 60,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function select(emoji: string) {
  emit('update:modelValue', emoji)
}

const emojis = [
  // 通用导航
  '📊', '📋', '📁', '📂', '📄', '📑', '📌', '📎',
  '🏠', '🏢', '🏗️', '🔗', '🧭', '🗺️', '🗂️', '📦',
  // 功能
  '🔍', '🔎', '⚙️', '🛠️', '🔧', '🔨', '🔩', '⛶',
  '🔔', '🔕', '📢', '📣', '💬', '💭', '🗨️', '✉️',
  // 用户 / 安全
  '👤', '👥', '🔐', '🔑', '🛡️', '🔒', '🔓', '🪪',
  // AI / 创作
  '🤖', '🧠', '🎨', '✨', '💡', '🪄', '🎯', '🎭',
  // 数据 / 图表
  '📈', '📉', '📆', '🗓️', '⏰', '💾', '📡', '🗃️',
  // 状态
  '✅', '❌', '⚠️', '❓', '💤', '🚀', '🔥', '⭐',
  // 主题
  '🌙', '☀️', '🌈', '🎵', '🖥️', '📱', '🖨️', '📷',
]
</script>

<style scoped>
.emoji-trigger {
  min-width: 42px;
  font-size: 18px;
  padding: 4px 8px;
  cursor: pointer;
}
.emoji-preview {
  font-size: 18px;
  line-height: 1;
}
.emoji-placeholder {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}
.emoji-cell {
  width: 32px;
  height: 32px;
  font-size: 18px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.emoji-cell:hover {
  background: var(--el-fill-color-light);
}
.emoji-cell.active {
  background: var(--el-color-primary-light-8);
}
.emoji-footer {
  margin-top: 6px;
  text-align: right;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 4px;
}
</style>
