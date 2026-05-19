<script setup lang="ts">
import { formatNumber } from "../composables/useVirtualCardPaging";

defineProps<{
  isDragging: boolean;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  loadPolicyText: string;
  wheelStatusText: string;
}>();
</script>

<template>
  <section class="live-strip" aria-live="polite">
    <div class="live-title">
      <span>{{ isDragging ? "正在定位到" : "当前显示" }}</span>
      <strong>第 {{ formatNumber(currentPage) }} 页开头</strong>
      <span>/ 共 {{ formatNumber(totalPages) }} 页</span>
    </div>
    <span class="status-pill" :class="{ active: isDragging }">{{ isDragging ? "拖动中" : "已停稳" }}</span>
    <span class="status-pill optimized">{{ loadPolicyText }}</span>
    <span class="status-pill">{{ wheelStatusText }}</span>
    <span class="status-pill">每页 {{ pageSize }} 个卡片</span>
  </section>
</template>
