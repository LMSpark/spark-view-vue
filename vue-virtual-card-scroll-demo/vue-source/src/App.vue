<script setup lang="ts">
import { ref } from "vue";
import PageHeader from "./components/PageHeader.vue";
import PageControls from "./components/PageControls.vue";
import LiveStatus from "./components/LiveStatus.vue";
import VirtualCardViewport from "./components/VirtualCardViewport.vue";
import CachePanel from "./components/CachePanel.vue";
import { useVirtualCardPaging } from "./composables/useVirtualCardPaging";
import type { VirtualCardViewportExpose } from "./types";

const cardViewport = ref<VirtualCardViewportExpose | null>(null);
const paging = useVirtualCardPaging(cardViewport);
</script>

<template>
  <main class="app">
    <PageHeader :total-pages="paging.totalPages.value" @jump="paging.scrollToPage" />

    <PageControls
      :total-pages="paging.totalPages.value"
      :current-page="paging.currentPage.value"
      :range-page="paging.rangePage.value"
      :draft-total-pages="paging.draftTotalPages.value"
      :jump-page="paging.jumpPage.value"
      @range-input="paging.handleRangeInput"
      @range-drag-start="paging.markDragging"
      @range-release="paging.releaseDragging"
      @draft-total-input="paging.draftTotalPages.value = $event"
      @jump-input="paging.jumpPage.value = $event"
      @apply-total="paging.applyTotalPages"
      @jump="paging.scrollToPage"
      @clear-cache="paging.clearCache"
      @nudge="paging.nudgePage"
    />

    <LiveStatus
      :is-dragging="paging.isDragging.value"
      :current-page="paging.currentPage.value"
      :total-pages="paging.totalPages.value"
      :page-size="paging.pageSize.value"
      :load-policy-text="paging.loadPolicyText.value"
      :wheel-status-text="paging.wheelStatusText.value"
    />

    <section class="main">
      <VirtualCardViewport
        ref="cardViewport"
        :cache="paging.cache.value"
        :pending="paging.pending.value"
        :current-page="paging.currentPage.value"
        :first-card-number="paging.firstCardNumber.value"
        :last-card-number="paging.lastCardNumber.value"
        :page-height="paging.pageHeight.value"
        :page-size="paging.pageSize.value"
        :progress-text="paging.progressText.value"
        :scroll-spacer-height="paging.scrollSpacerHeight.value"
        :visible-pages="paging.visiblePages.value"
        :is-dragging="paging.isDragging.value"
        @scroll-top="paging.handleViewportScroll"
        @viewport-ready="paging.refreshViewportHeight"
        @wheel-page="paging.handleWheelPage"
      />

      <CachePanel
        :current-page="paging.currentPage.value"
        :total-cards="paging.totalCards.value"
        :cached-pages="paging.cachedPages.value"
        :pending-pages="paging.pendingPages.value"
        :notice="paging.notice.value"
        :last-request-text="paging.lastRequestText.value"
      />
    </section>
  </main>
</template>
