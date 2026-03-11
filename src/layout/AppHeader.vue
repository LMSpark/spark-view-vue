<template>
  <div class="app-header">
    <!-- 左侧：折叠按钮 + 标题 -->
    <div class="app-header__left">
      <button v-if="collapsible" class="header-btn" @click="$emit('toggle-collapse')" title="切换侧栏">
        <el-icon :size="18"><Expand v-if="collapsed" /><Fold v-else /></el-icon>
      </button>
      <span class="app-header__title">{{ title }}</span>
    </div>

    <!-- 中间：导航槽位 -->
    <div class="app-header__center">
      <slot name="nav" />
    </div>

    <!-- 右侧：操作区 -->
    <div class="app-header__right">
      <!-- 自定义操作槽位 -->
      <slot name="actions" />

      <!-- 搜索 -->
      <el-tooltip content="搜索" placement="bottom" :show-after="300">
        <button class="header-btn" @click="$emit('search')">
          <el-icon :size="18"><Search /></el-icon>
        </button>
      </el-tooltip>

      <!-- 全屏 -->
      <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'" placement="bottom" :show-after="300">
        <button class="header-btn" @click="toggleFullscreen">
          <el-icon :size="18"><FullScreen /></el-icon>
        </button>
      </el-tooltip>

      <!-- 通知 -->
      <el-tooltip content="通知" placement="bottom" :show-after="300">
        <button class="header-btn" @click="$emit('notification-click')">
          <el-badge :value="notificationCount" :hidden="!notificationCount" :max="99">
            <el-icon :size="18"><Bell /></el-icon>
          </el-badge>
        </button>
      </el-tooltip>

      <!-- 主题切换 -->
      <el-tooltip :content="isDark ? '浅色模式' : '深色模式'" placement="bottom" :show-after="300">
        <button class="header-btn" @click="$emit('toggle-theme')">
          <el-icon :size="18"><Sunny v-if="isDark" /><Moon v-else /></el-icon>
        </button>
      </el-tooltip>

      <!-- 分隔线 -->
      <el-divider direction="vertical" class="header-divider" />

      <!-- 用户下拉 -->
      <el-dropdown trigger="click" @command="handleUserCommand">
        <div class="header-user">
          <el-avatar :size="28" :src="avatar || undefined">
            {{ avatarText }}
          </el-avatar>
          <span class="header-user__name">{{ username }}</span>
          <el-icon :size="12"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">
              <el-icon><User /></el-icon>个人中心
            </el-dropdown-item>
            <el-dropdown-item command="settings">
              <el-icon><Setting /></el-icon>系统设置
            </el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon>退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import {
  Fold, Expand, Search, FullScreen, Bell, Sunny, Moon,
  User, Setting, SwitchButton, ArrowDown,
} from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  title?: string
  isDark?: boolean
  collapsed?: boolean
  collapsible?: boolean
  username?: string
  avatar?: string
  notificationCount?: number
}>(), {
  title: 'SPARK 管理后台',
  isDark: false,
  collapsed: false,
  collapsible: true,
  username: '管理员',
  avatar: '',
  notificationCount: 0,
})

const emit = defineEmits<{
  'toggle-collapse': []
  'toggle-theme': []
  'search': []
  'notification-click': []
  'user-command': [command: string]
}>()

/* 用户头像文字（取用户名首字） */
const avatarText = computed(() => props.username.charAt(0))

/* 全屏切换 */
const isFullscreen = ref(false)

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen()
  } else {
    void document.documentElement.requestFullscreen()
  }
}

function onFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

/* 用户菜单命令 */
function handleUserCommand(command: string | number | object) {
  emit('user-command', String(command))
}
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  padding: 0 12px;
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.app-header__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.app-header__center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
}

.app-header__right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 通用操作按钮 */
.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
  transition: background 0.2s;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.header-btn:active {
  background: rgba(255, 255, 255, 0.18);
}

/* 分隔线 */
.header-divider {
  --el-border-color: rgba(255, 255, 255, 0.2);
  margin: 0 6px;
  height: 20px;
}

/* 用户区域 */
.header-user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: inherit;
  transition: background 0.2s;
}

.header-user:hover {
  background: rgba(255, 255, 255, 0.12);
}

.header-user__name {
  font-size: 13px;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* el-badge 样式微调 */
:deep(.el-badge__content) {
  border: none;
}

/* 小屏隐藏用户名 */
@media (max-width: 768px) {
  .header-user__name {
    display: none;
  }
}
</style>
