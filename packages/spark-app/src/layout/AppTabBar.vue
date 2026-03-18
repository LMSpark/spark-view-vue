<template>
  <div class="app-tab-bar">
    <div class="app-tab-bar__tabs">
      <div
        v-for="tab in tabs"
        :key="tab.path"
        class="app-tab-bar__tab"
        :class="{ 'app-tab-bar__tab--active': tab.path === activeTab }"
        @click="switchTo(tab.path)"
        @contextmenu.prevent="onContextMenu($event, tab)"
      >
        <span class="app-tab-bar__tab-icon" v-if="tab.icon"><NavIcon :name="tab.icon" /></span>
        <span class="app-tab-bar__tab-title">{{ tab.title }}</span>
        <span
          v-if="tab.closable"
          class="app-tab-bar__tab-close"
          @click.stop="closeTab(tab.path)"
        >×</span>
      </div>
    </div>

    <!-- 右侧区域：上下文选择器等 -->
    <div v-if="$slots['trailing']" class="app-tab-bar__trailing">
      <slot name="trailing" />
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="ctxVisible"
        class="app-tab-bar__ctx-menu"
        :style="{ left: ctxPos.x + 'px', top: ctxPos.y + 'px' }"
      >
        <div class="app-tab-bar__ctx-item" @click="doCtxAction('close')">关闭</div>
        <div class="app-tab-bar__ctx-item" @click="doCtxAction('closeOthers')">关闭其他</div>
        <div class="app-tab-bar__ctx-item" @click="doCtxAction('closeAll')">关闭全部</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useTabPages } from '../navigation/useTabPages'
import type { TabPage } from '../navigation/useTabPages'
import NavIcon from '../components/NavIcon.vue'

const { tabs, activeTab, closeTab, closeOthers, closeAll, switchTo } = useTabPages()

/* ── 右键菜单 ── */
const ctxVisible = ref(false)
const ctxPos = reactive({ x: 0, y: 0 })
let ctxTarget: TabPage | null = null

function onContextMenu(e: MouseEvent, tab: TabPage) {
  ctxTarget = tab
  ctxPos.x = e.clientX
  ctxPos.y = e.clientY
  ctxVisible.value = true
}

function doCtxAction(action: 'close' | 'closeOthers' | 'closeAll') {
  ctxVisible.value = false
  if (!ctxTarget) return
  switch (action) {
    case 'close':
      closeTab(ctxTarget.path)
      break
    case 'closeOthers':
      closeOthers(ctxTarget.path)
      break
    case 'closeAll':
      closeAll()
      break
  }
  ctxTarget = null
}

function hideCtxMenu() {
  ctxVisible.value = false
}

onMounted(() => document.addEventListener('click', hideCtxMenu))
onBeforeUnmount(() => document.removeEventListener('click', hideCtxMenu))
</script>

<style scoped>
.app-tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.app-tab-bar__tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  height: 100%;
  padding: 0 4px;
  flex: 1;
  min-width: 0;
}

.app-tab-bar__trailing {
  flex-shrink: 0;
  flex-grow: 0;
  min-width: fit-content;
  padding: 0 8px;
}

.app-tab-bar__tabs::-webkit-scrollbar {
  display: none;
}

.app-tab-bar__tab {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  white-space: nowrap;
  font-size: 12px;
  color: var(--spark-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  transition: color 0.2s, background 0.2s;
  user-select: none;
}

.app-tab-bar__tab:hover {
  color: var(--spark-text-primary);
  background: var(--spark-bg-overlay);
}

.app-tab-bar__tab--active {
  color: var(--spark-text-primary);
  background: var(--spark-bg);
  border-color: var(--spark-border-light);
  font-weight: 500;
}

.app-tab-bar__tab-icon {
  font-size: 13px;
}

.app-tab-bar__tab-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-tab-bar__tab-close {
  font-size: 14px;
  line-height: 1;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-left: 2px;
  transition: background 0.15s, color 0.15s;
}

.app-tab-bar__tab-close:hover {
  background: var(--spark-border-color);
  color: var(--spark-text-primary);
}

/* ── 右键菜单 ── */
.app-tab-bar__ctx-menu {
  position: fixed;
  z-index: 9999;
  background: var(--spark-bg-overlay);
  border: 1px solid var(--spark-border-light);
  border-radius: 4px;
  box-shadow: var(--spark-shadow);
  padding: 4px 0;
  min-width: 100px;
}

.app-tab-bar__ctx-item {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--spark-text-regular);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.app-tab-bar__ctx-item:hover {
  background: var(--spark-bg);
  color: var(--spark-text-primary);
}
</style>
