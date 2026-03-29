<template>
  <div class="spark-component-renderer spark-component-unregistered">
    <div class="unregistered-header">
      <div class="unregistered-warning">
        <strong>⚠️ 未注册的组件类型:</strong>
        <span class="unregistered-type">{{ node.type }}</span>
      </div>

      <button
        type="button"
        class="unregistered-details-button"
        :aria-expanded="detailsVisible ? 'true' : 'false'"
        @click="toggleDetails"
      >{{ detailsVisible ? '收起属性' : '查看全部属性' }}</button>
    </div>

    <div v-if="detailsVisible" class="unregistered-details-panel" role="dialog" aria-label="未注册组件属性详情">
      <div class="unregistered-details-title">节点快照</div>
      <pre class="unregistered-details-code">{{ nodeSnapshot }}</pre>
    </div>

    <div v-if="hasDefaultSlot" class="unregistered-children">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'
import type { PropType } from 'vue'
import type { SparkNode } from '../../core/types.js'

const props = defineProps({
  node: {
    type: Object as PropType<SparkNode>,
    required: true,
  },
})

const slots = useSlots()
const detailsVisible = ref(false)
const hasDefaultSlot = computed(() => typeof slots['default'] === 'function')

function createSnapshotReplacer() {
  const seen = new WeakSet<object>()

  return (_key: string, value: unknown): unknown => {
    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`
    }

    if (typeof value === 'bigint') {
      return `${value.toString()}n`
    }

    if (typeof value === 'symbol') {
      return value.toString()
    }

    if (value === undefined) {
      return '[undefined]'
    }

    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]'
      }
      seen.add(value)
    }

    return value
  }
}

const nodeSnapshot = computed(() => JSON.stringify(props.node, createSnapshotReplacer(), 2))

function toggleDetails(): void {
  detailsVisible.value = !detailsVisible.value
}
</script>

<style scoped>
.spark-component-unregistered {
  position: relative;
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px dashed #d97706;
  border-radius: 10px;
  background: linear-gradient(180deg, #fff7ed 0%, #fffbeb 100%);
}

.unregistered-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.unregistered-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #9a3412;
  font-size: 13px;
  line-height: 1.5;
}

.unregistered-type {
  font-family: Consolas, 'Courier New', monospace;
  font-weight: 600;
}

.unregistered-details-button {
  appearance: none;
  border: 1px solid #fdba74;
  border-radius: 999px;
  background: #ffffff;
  color: #9a3412;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}

.unregistered-details-button:hover {
  background: #fff7ed;
}

.unregistered-details-button:focus-visible {
  outline: 2px solid #fb923c;
  outline-offset: 2px;
}

.unregistered-details-panel {
  overflow: auto;
  max-height: 320px;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 24px rgba(154, 52, 18, 0.12);
}

.unregistered-details-title {
  padding: 10px 12px 0;
  color: #7c2d12;
  font-size: 12px;
  font-weight: 600;
}

.unregistered-details-code {
  margin: 0;
  padding: 10px 12px 12px;
  color: #7c2d12;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.unregistered-children {
  display: contents;
}
</style>