<template>
  <el-drawer
    :model-value="modelValue"
    title="主题配置"
    direction="rtl"
    size="300px"
    :z-index="2001"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <!-- 主题模式 -->
    <div class="config-section">
      <div class="config-section__title">主题模式</div>
      <div class="config-section__content">
        <div class="theme-mode-cards">
          <div
            v-for="opt in themeModes"
            :key="opt.value"
            class="theme-card"
            :class="{ 'theme-card--active': currentTheme === opt.value }"
            @click="setThemeMode(opt.value)"
          >
            <span class="theme-card__icon">{{ opt.icon }}</span>
            <span class="theme-card__label">{{ opt.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 主题色 -->
    <div class="config-section">
      <div class="config-section__title">主题色</div>
      <div class="config-section__content">
        <div class="color-circles">
          <div
            v-for="p in PRIMARY_PRESETS"
            :key="p.color"
            class="color-circle"
            :class="{ 'color-circle--active': primaryColor === p.color }"
            :style="{ backgroundColor: p.color }"
            :title="p.name"
            @click="setPrimaryColor(p.color)"
          >
            <span v-if="primaryColor === p.color" class="color-circle__check">✓</span>
          </div>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 导航配色 -->
    <div class="config-section">
      <div class="config-section__title">导航配色</div>
      <div class="config-section__content">
        <div class="nav-swatches">
          <div
            v-for="(preset, i) in NAV_PRESETS"
            :key="i"
            class="nav-swatch"
            :class="{ 'nav-swatch--active': navPresetIndex === i }"
            :title="preset.name"
            @click="setNavPreset(i)"
          >
            <div class="nav-swatch__mini">
              <div class="nav-swatch__sidebar" :style="{ background: preset.light.sidebarBg }" />
              <div class="nav-swatch__body">
                <div class="nav-swatch__header" :style="{ background: preset.light.headerBg }" />
                <div class="nav-swatch__content" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 布局方向 -->
    <div class="config-section">
      <div class="config-section__title">导航模式</div>
      <div class="config-section__content">
        <div class="layout-preview-cards">
          <div
            class="layout-preview"
            :class="{ 'layout-preview--active': !headerFirst }"
            @click="$emit('update:headerFirst', false)"
          >
            <div class="layout-mini layout-mini--sidebar-first">
              <div class="mini-sidebar" :style="{ background: navDisplayColor }" />
              <div class="mini-body">
                <div class="mini-header" :style="{ background: navDisplayColor }" />
                <div class="mini-content" />
              </div>
            </div>
            <span class="layout-preview__label">侧栏导航</span>
          </div>
          <div
            class="layout-preview"
            :class="{ 'layout-preview--active': headerFirst }"
            @click="$emit('update:headerFirst', true)"
          >
            <div class="layout-mini layout-mini--header-first">
              <div class="mini-header" :style="{ background: navDisplayColor }" />
              <div class="mini-lower">
                <div class="mini-sidebar" :style="{ background: navDisplayColor }" />
                <div class="mini-content" />
              </div>
            </div>
            <span class="layout-preview__label">顶栏导航</span>
          </div>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 页签模式 -->
    <div class="config-section">
      <div class="config-section__title">页签模式</div>
      <div class="config-section__content">
        <div class="config-row">
          <span class="config-row__label">多页签模式</span>
          <el-switch :model-value="mode === 'multi'" @change="$emit('update:mode', $event ? 'multi' : 'single')" />
        </div>
        <div class="config-hint">{{ mode === 'multi' ? '标签栏切换页面，支持 keep-alive' : '面包屑导航，单页浏览' }}</div>
      </div>
    </div>

    <el-divider />

    <!-- 界面设置 -->
    <div class="config-section">
      <div class="config-section__title">界面设置</div>
      <div class="config-section__content">
        <div class="config-row">
          <span class="config-row__label">侧栏折叠</span>
          <el-switch :model-value="collapsed" @change="$emit('update:collapsed', $event)" />
        </div>
        <div class="config-row">
          <span class="config-row__label">显示页脚</span>
          <el-switch :model-value="showFooter" @change="$emit('update:showFooter', $event)" />
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '@spark-view/spark-app'
import type { ThemeMode } from '@spark-view/spark-app'
import type { PageMode } from './useTabPages'
import { useColorScheme, PRIMARY_PRESETS, NAV_PRESETS } from './useColorScheme'

defineProps<{
  modelValue: boolean
  headerFirst: boolean
  collapsed: boolean
  showFooter: boolean
  mode: PageMode
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  'update:headerFirst': [value: boolean]
  'update:collapsed': [value: boolean]
  'update:showFooter': [value: boolean]
  'update:mode': [value: PageMode]
}>()

const theme = useTheme()
const currentTheme = computed(() => theme?.mode ?? 'light')

const { primaryColor, navPresetIndex, currentNavPreset, setPrimaryColor, setNavPreset } = useColorScheme()
const navDisplayColor = computed(() => currentNavPreset.value.light.sidebarBg)

const themeModes: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: '浅色', icon: '☀️' },
  { value: 'dark', label: '深色', icon: '🌙' },
  { value: 'auto', label: '跟随系统', icon: '💻' },
]

function setThemeMode(mode: ThemeMode) {
  theme?.setMode(mode)
}
</script>

<style scoped>
.config-section {
  margin-bottom: 4px;
}

.config-section__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--spark-text-primary);
  margin-bottom: 12px;
}

.config-section__content {
  padding-left: 2px;
}

/* 主题模式卡片 */
.theme-mode-cards {
  display: flex;
  gap: 10px;
}

.theme-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 2px solid var(--spark-border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--spark-bg-page);
}

.theme-card:hover {
  border-color: var(--el-color-primary-light-3);
}

.theme-card--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.theme-card__icon {
  font-size: 22px;
}

.theme-card__label {
  font-size: 12px;
  color: var(--spark-text-regular);
}

/* 布局预览卡片 */
.layout-preview-cards {
  display: flex;
  gap: 12px;
}

.layout-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.layout-preview__label {
  font-size: 12px;
  color: var(--spark-text-regular);
}

.layout-mini {
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 2px solid var(--spark-border-light);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s;
  background: var(--spark-bg);
}

.layout-preview:hover .layout-mini {
  border-color: var(--el-color-primary-light-3);
}

.layout-preview--active .layout-mini {
  border-color: var(--el-color-primary);
}

/* 侧栏优先布局预览 */
.layout-mini--sidebar-first {
  display: flex;
}

.layout-mini--sidebar-first .mini-sidebar {
  width: 22%;
  background: #001529;
  flex-shrink: 0;
}

.layout-mini--sidebar-first .mini-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.layout-mini--sidebar-first .mini-header {
  height: 22%;
  background: #001529;
  flex-shrink: 0;
}

.layout-mini--sidebar-first .mini-content {
  flex: 1;
  background: var(--spark-bg-page);
}

/* 顶栏优先布局预览 */
.layout-mini--header-first {
  display: flex;
  flex-direction: column;
}

.layout-mini--header-first .mini-header {
  height: 22%;
  background: #001529;
  flex-shrink: 0;
}

.layout-mini--header-first .mini-lower {
  flex: 1;
  display: flex;
}

.layout-mini--header-first .mini-sidebar {
  width: 22%;
  background: #001529;
  flex-shrink: 0;
}

.layout-mini--header-first .mini-content {
  flex: 1;
  background: var(--spark-bg-page);
}

/* 设置行 */
.config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.config-row__label {
  font-size: 13px;
  color: var(--spark-text-regular);
}

.config-hint {
  font-size: 12px;
  color: var(--spark-text-secondary);
  margin-top: 4px;
}

:deep(.el-divider) {
  margin: 16px 0;
}

/* 主题色圆圈 */
.color-circles {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.color-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}

.color-circle:hover {
  transform: scale(1.15);
}

.color-circle--active {
  box-shadow: 0 0 0 2px var(--spark-bg-page), 0 0 0 4px var(--spark-text-secondary);
}

.color-circle__check {
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
}

/* 导航配色预览 */
.nav-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.nav-swatch {
  cursor: pointer;
}

.nav-swatch__mini {
  width: 52px;
  height: 40px;
  display: flex;
  border: 2px solid var(--spark-border-light);
  border-radius: 4px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.nav-swatch:hover .nav-swatch__mini {
  border-color: var(--el-color-primary-light-3);
}

.nav-swatch--active .nav-swatch__mini {
  border-color: var(--el-color-primary);
}

.nav-swatch__sidebar {
  width: 30%;
  flex-shrink: 0;
}

.nav-swatch__body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.nav-swatch__header {
  height: 30%;
  flex-shrink: 0;
}

.nav-swatch__content {
  flex: 1;
  background: var(--spark-bg-page);
}
</style>
