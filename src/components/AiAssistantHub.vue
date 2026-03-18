<template>
  <div class="assistant-hub-wrapper">
    <button class="assistant-fab" :class="{ active: isOpen }" @click="togglePanel" title="AI 助手">
      <span v-if="!isOpen">🤖</span>
      <span v-else>✕</span>
    </button>

    <Transition name="assistant-slide">
      <div v-if="isOpen" class="assistant-hub-panel">
        <div class="assistant-mode-switch" role="tablist" aria-label="assistant mode">
          <button
            class="assistant-mode-btn"
            :class="{ active: mode === 'ai' }"
            @click="mode = 'ai'"
          >
            🤖 页面
          </button>
          <button
            class="assistant-mode-btn"
            :class="{ active: mode === 'sap' }"
            @click="mode = 'sap'"
          >
            🔧 工具
          </button>
        </div>

        <KeepAlive>
          <component :is="activeComponent" embedded :force-open="true" />
        </KeepAlive>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const AiChatPanel = defineAsyncComponent(() => import('@/components/AiChatPanel.vue'))
const SapChatPanel = defineAsyncComponent(() => import('@/components/SapChatPanel.vue'))

type AssistantMode = 'ai' | 'sap'

const route = useRoute()
const isOpen = ref(false)
const mode = ref<AssistantMode>('ai')

const activeComponent = computed(() => (mode.value === 'ai' ? AiChatPanel : SapChatPanel))

function togglePanel(): void {
  isOpen.value = !isOpen.value
}

watch(() => route.query['aiDebug'], (val) => {
  if (val === '1') {
    mode.value = 'ai'
    isOpen.value = true
  }
}, { immediate: true })
</script>

<style scoped>
.assistant-hub-wrapper {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 9999;
}

.assistant-fab {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.assistant-fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 24px rgba(102, 126, 234, 0.6);
}

.assistant-fab.active {
  background: #666;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.assistant-hub-panel {
  position: absolute;
  right: 0;
  bottom: 64px;
  width: 26vw;
  min-width: 420px;
  max-width: 520px;
  height: 75vh;
  overflow: hidden;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  background: #fff;
}

.assistant-mode-switch {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 12;
  display: inline-flex;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(4px);
}

.assistant-mode-btn {
  border: none;
  background: transparent;
  color: #fff;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.assistant-mode-btn.active {
  background: rgba(255, 255, 255, 0.28);
  font-weight: 600;
}

.assistant-slide-enter-active,
.assistant-slide-leave-active {
  transition: all 0.25s ease;
}

.assistant-slide-enter-from,
.assistant-slide-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
