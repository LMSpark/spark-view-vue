<script setup lang="ts">
const props = defineProps<{
  totalPages: number;
  currentPage: number;
  rangePage: number;
  draftTotalPages: number;
  jumpPage: number;
}>();

defineEmits<{
  rangeInput: [page: number];
  rangeDragStart: [];
  rangeRelease: [];
  draftTotalInput: [totalPages: number];
  jumpInput: [page: number];
  applyTotal: [];
  jump: [page: number];
  clearCache: [];
  nudge: [delta: number];
}>();

function readInt(event: Event, fallback: number): number {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  return Number.isFinite(value) ? value : fallback;
}
</script>

<template>
  <section class="control-bar" aria-label="定位控制">
    <div class="control">
      <label for="pageRange">拖拽定位页码</label>
      <input
        id="pageRange"
        type="range"
        min="1"
        :max="totalPages"
        step="1"
        :value="rangePage"
        @input="$emit('rangeInput', readInt($event, props.rangePage))"
        @pointerdown="$emit('rangeDragStart')"
        @pointerup="$emit('rangeRelease')"
      />
    </div>
    <div class="control">
      <label for="totalPagesInput">总页数</label>
      <input
        id="totalPagesInput"
        type="number"
        min="1"
        step="1"
        :value="draftTotalPages"
        @input="$emit('draftTotalInput', readInt($event, props.draftTotalPages))"
      />
    </div>
    <div class="control">
      <label for="jumpInput">跳转页</label>
      <input
        id="jumpInput"
        type="number"
        min="1"
        :max="totalPages"
        step="1"
        :value="jumpPage"
        @input="$emit('jumpInput', readInt($event, props.jumpPage))"
      />
    </div>
    <div class="button-row">
      <button type="button" class="primary" @click="$emit('applyTotal')">应用</button>
      <button type="button" :disabled="currentPage <= 1" @click="$emit('nudge', -1)">上页</button>
      <button type="button" :disabled="currentPage >= totalPages" @click="$emit('nudge', 1)">下页</button>
      <button type="button" @click="$emit('jump', jumpPage)">跳转</button>
      <button type="button" @click="$emit('clearCache')">清缓存</button>
    </div>
  </section>
</template>
