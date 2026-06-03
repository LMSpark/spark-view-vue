<script setup lang="ts">
import { onMounted, ref } from "vue";
import { formatNumber } from "../composables/useVirtualCardPaging";
import LazyCardImage from "./LazyCardImage.vue";
import type { MockCard, WheelPageEvent } from "../types";

const props = defineProps<{
  cache: Record<number, MockCard[]>;
  pending: Record<number, boolean>;
  currentPage: number;
  firstCardNumber: number;
  lastCardNumber: number;
  pageHeight: number;
  pageSize: number;
  progressText: string;
  scrollSpacerHeight: number;
  visiblePages: number[];
  isDragging: boolean;
}>();

const emit = defineEmits<{
  scrollTop: [value: number];
  viewportReady: [height: number];
  wheelPage: [event: WheelPageEvent];
}>();

const viewport = ref<HTMLDivElement | null>(null);

onMounted(() => {
  emit("viewportReady", viewportHeight());
});

function viewportHeight(): number {
  return viewport.value?.clientHeight || 0;
}

function viewportScrollTop(): number {
  return viewport.value?.scrollTop || 0;
}

function setScrollTop(value: number): void {
  if (viewport.value) {
    viewport.value.scrollTop = value;
  }
}

function onScroll(): void {
  emit("scrollTop", viewportScrollTop());
}

function onWheel(event: WheelEvent): void {
  if (event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? props.pageHeight : 1;
  emit("wheelPage", {
    deltaY: event.deltaY * unit,
    timeStamp: event.timeStamp
  });
}

function cardNumber(page: number, slot: number): number {
  return (page - 1) * props.pageSize + slot;
}

function cardFor(page: number, slot: number): MockCard | null {
  const cards = props.cache[page];
  return cards ? cards[slot - 1] : null;
}

function isPagePending(page: number): boolean {
  return Boolean(props.pending[page]);
}

function pageStatus(page: number): string {
  if (props.cache[page]) return "已加载 6 个卡片";
  if (props.pending[page]) return "mock 异步加载中";
  if (props.isDragging) return "拖动中暂不请求";
  return "等待停稳后请求";
}

defineExpose({
  setScrollTop,
  viewportHeight,
  viewportScrollTop
});
</script>

<template>
  <div class="viewer">
    <div class="viewer-head">
      <strong>卡片列表</strong>
      <span>
        滚动比例 {{ progressText }}，卡片 {{ formatNumber(firstCardNumber) }}-{{ formatNumber(lastCardNumber) }}
      </span>
    </div>

    <div class="viewport-wrap">
      <div class="scroll-hud" :class="{ active: isDragging }">
        {{ isDragging ? "拖动中" : "当前页" }}:
        <strong>第 {{ formatNumber(currentPage) }} 页开头</strong>
      </div>

      <div
        ref="viewport"
        class="viewport"
        tabindex="0"
        aria-label="Vue 虚拟分页卡片"
        @scroll="onScroll"
        @wheel="onWheel"
      >
        <div class="spacer" :style="{ height: `${scrollSpacerHeight}px` }"></div>

        <section
          v-for="page in visiblePages"
          :key="page"
          class="page-block"
          :style="{
            height: `${pageHeight}px`,
            transform: `translateY(${(page - 1) * pageHeight}px)`
          }"
        >
          <div class="page-inner">
            <div class="page-meta">
              <div class="page-start">
                <span>页开头</span>
                <strong>第 {{ formatNumber(page) }} 页开头</strong>
              </div>
              <span>{{ pageStatus(page) }}</span>
            </div>

            <div class="card-grid">
              <article v-for="slot in pageSize" :key="`${page}-${slot}`" class="data-card">
                <template v-if="cardFor(page, slot)">
                  <div class="card-top">
                    <span class="card-index">#{{ formatNumber(cardFor(page, slot)!.id) }}</span>
                    <span class="card-tag">{{ cardFor(page, slot)!.tag }}</span>
                  </div>
                  <div class="card-body">
                    <LazyCardImage :card="cardFor(page, slot)!" />
                    <div class="card-copy">
                      <h2 class="card-title">{{ cardFor(page, slot)!.title }}</h2>
                      <p class="card-note">{{ cardFor(page, slot)!.note }}</p>
                    </div>
                  </div>
                  <div class="card-bottom">
                    <span>页内 {{ slot }}/{{ pageSize }}</span>
                    <strong>{{ cardFor(page, slot)!.score }}</strong>
                  </div>
                </template>

                <template v-else>
                  <div class="card-top">
                    <span class="card-index">#{{ formatNumber(cardNumber(page, slot)) }}</span>
                    <span class="card-tag">{{ isPagePending(page) ? "loading" : "queued" }}</span>
                  </div>
                  <div class="card-body">
                    <div class="card-image skeleton-image">
                      <div class="card-image-placeholder">
                        <span>queued</span>
                      </div>
                    </div>
                    <div class="card-copy">
                      <div class="skeleton-line medium"></div>
                      <p class="card-note">第 {{ formatNumber(page) }} 页的 mock 数据会在停稳后异步填充。</p>
                    </div>
                  </div>
                  <div class="card-bottom">
                    <span class="skeleton-line short"></span>
                    <span>pending</span>
                  </div>
                </template>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
