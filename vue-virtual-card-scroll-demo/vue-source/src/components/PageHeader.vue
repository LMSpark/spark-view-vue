<script setup lang="ts">
defineProps<{
  totalPages: number;
}>();

defineEmits<{
  jump: [page: number];
}>();
</script>

<template>
  <header class="topbar">
    <div>
      <h1>Vue 卡片虚拟分页</h1>
      <p class="subtitle">Vue 源码版；每页 6 个卡片，mockFetchCards 模拟异步分页数据。</p>
    </div>
    <div class="button-row" aria-label="快捷跳页">
      <button type="button" @click="$emit('jump', 1)">第 1 页</button>
      <button type="button" @click="$emit('jump', 800)">第 800 页</button>
      <button type="button" class="primary" @click="$emit('jump', totalPages)">最后一页</button>
    </div>
  </header>
</template>
