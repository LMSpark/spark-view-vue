<script setup lang="ts">
import { formatNumber } from "../composables/useVirtualCardPaging";

defineProps<{
  currentPage: number;
  totalCards: number;
  cachedPages: number[];
  pendingPages: number[];
  notice: string;
  lastRequestText: string;
}>();
</script>

<template>
  <aside class="side" aria-label="缓存状态">
    <div class="metric-grid">
      <div class="metric">
        <span class="metric-label">当前页</span>
        <span class="metric-value">{{ formatNumber(currentPage) }}</span>
      </div>
      <div class="metric">
        <span class="metric-label">总卡片数</span>
        <span class="metric-value">{{ formatNumber(totalCards) }}</span>
      </div>
      <div class="metric">
        <span class="metric-label">已缓存页</span>
        <span class="metric-value">{{ formatNumber(cachedPages.length) }}</span>
        <div class="chip-list">
          <span v-for="page in cachedPages.slice(0, 15)" :key="`c-${page}`" class="chip">{{ page }}</span>
          <span v-if="cachedPages.length > 15" class="chip">+{{ cachedPages.length - 15 }}</span>
        </div>
      </div>
      <div class="metric">
        <span class="metric-label">正在请求页</span>
        <span class="metric-value">{{ formatNumber(pendingPages.length) }}</span>
        <div class="chip-list">
          <span v-for="page in pendingPages.slice(0, 15)" :key="`p-${page}`" class="chip pending">{{ page }}</span>
        </div>
      </div>
      <div class="metric">
        <span class="metric-label">最近 mock 请求</span>
        <span class="metric-value" style="font-size: 13px;">{{ lastRequestText || "等待请求" }}</span>
      </div>
    </div>
    <div class="notice" role="status">{{ notice }}</div>
  </aside>
</template>
