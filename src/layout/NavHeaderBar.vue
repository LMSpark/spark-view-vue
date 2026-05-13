<template>
  <nav class="nav-header-bar">
    <template v-for="item in props.items" :key="item.id">
    <div
      class="nav-header-bar__item"
      :class="{
        'nav-header-bar__item--active': isActive(item),
        'nav-header-bar__item--disabled': item.disabled,
        'nav-header-bar__item--has-children': hasDropdown(item),
      }"
      @click="handleClick(item)"
    >
      <span v-if="item.icon" class="nav-header-bar__icon"><NavIcon :name="item.icon" /></span>
      <span class="nav-header-bar__title">{{ item.title }}</span>
      <span v-if="badge(item)" class="nav-header-bar__badge">{{ badge(item) }}</span>

      <!-- 下拉子菜单（childPlacement: 'parent', 'flat'） -->
      <div v-if="hasDropdown(item)" class="nav-header-bar__dropdown">
        <template v-for="child in visibleChildren(item)" :key="child.id">
          <div
            class="nav-header-bar__dropdown-item"
            :class="{
              'nav-header-bar__dropdown-item--active': isActive(child),
              'nav-header-bar__dropdown-item--disabled': child.disabled,
            }"
            @click.stop="handleClick(child)"
          >
            <span v-if="child.icon" class="nav-header-bar__dropdown-icon"><NavIcon :name="child.icon" /></span>
            <span>{{ child.title }}</span>
          </div>
          <div v-if="child.dividerAfter" class="nav-header-bar__dropdown-divider" />
        </template>
      </div>
    </div>
    <div v-if="item.dividerAfter" class="nav-header-bar__divider" />
    </template>
  </nav>
</template>

<script setup lang="ts">
import type { NavNode } from '@spark-view/spark-page-config'
import { useNav } from '@spark-view/spark-app'
import NavIcon from '@/components/NavIcon.vue'

const props = withDefaults(defineProps<{
  items?: NavNode[]
}>(), {
  items: () => [],
})

const nav = useNav()

function handleClick(node: NavNode) {
  if (node.disabled) return
  nav?.navigateTo(node)
}

function isActive(node: NavNode): boolean {
  return nav?.isNodeActive(node) ?? false
}

function badge(node: NavNode): string | number | undefined {
  return nav?.getBadge(node.id)
}

function hasDropdown(item: NavNode): boolean {
  if (item.nodeKind !== 'module' && item.nodeKind !== 'system-directory') return false
  const cp = item.childPlacement
  return Boolean(item.children?.length && (cp === 'parent' || cp === 'flat'))
}

function visibleChildren(item: NavNode): NavNode[] {
  return (item.children ?? []).filter((c) => !c.hidden && !c.disabled && c.nodeKind !== 'sub-page')
}
</script>

<style scoped>
.nav-header-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
}

.nav-header-bar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  padding: 0 14px;
  cursor: pointer;
  color: inherit;
  opacity: 0.75;
  font-size: 14px;
  white-space: nowrap;
  transition: opacity 0.2s, background 0.2s;
  user-select: none;
}

.nav-header-bar__item:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}

.nav-header-bar__item--active {
  opacity: 1;
  font-weight: 600;
  box-shadow: inset 0 -2px 0 currentColor;
}

.nav-header-bar__item--disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.nav-header-bar__icon {
  font-size: 15px;
}

.nav-header-bar__badge {
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 8px;
  margin-left: 2px;
}

/* ── 下拉子菜单 ── */
.nav-header-bar__dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 160px;
  background: var(--spark-bg-overlay, #fff);
  border: 1px solid var(--spark-border-light, #e4e7ed);
  border-radius: 4px;
  box-shadow: var(--spark-shadow, 0 2px 12px rgba(0, 0, 0, 0.1));
  padding: 4px 0;
  z-index: 2000;
}

.nav-header-bar__item--has-children:hover .nav-header-bar__dropdown {
  display: block;
}

.nav-header-bar__dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--spark-text-regular, #606266);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.nav-header-bar__dropdown-item:hover {
  background: var(--spark-bg, #f5f7fa);
  color: var(--spark-text-primary, #303133);
}

.nav-header-bar__dropdown-item--active {
  color: var(--el-color-primary, #409eff);
  font-weight: 500;
}

.nav-header-bar__dropdown-item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-header-bar__dropdown-icon {
  font-size: 14px;
}

/* ── 分割线 ── */
.nav-header-bar__divider {
  width: 1px;
  height: 16px;
  background: currentColor;
  opacity: 0.2;
  align-self: center;
  flex-shrink: 0;
}

.nav-header-bar__dropdown-divider {
  height: 1px;
  background: var(--spark-border-light, #e4e7ed);
  margin: 4px 12px;
}
</style>
