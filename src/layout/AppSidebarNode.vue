<template>
  <el-sub-menu v-if="shouldRenderAsSubMenu(item)" :index="item.id">
    <template #title>
      <span class="app-sidebar__menu-label">
        <NavIcon :name="item.icon" class="app-sidebar__menu-icon" />
        <span v-if="showText" class="app-sidebar__menu-text">{{ item.title }}</span>
      </span>
    </template>
    <AppSidebarNode
      v-for="child in visibleChildren(item)"
      :key="child.id"
      :item="child"
      :collapsed="collapsed"
      :show-text="true"
    />
  </el-sub-menu>

  <el-menu-item-group v-else-if="isDirectoryGroupNode(item)" :title="showText ? item.title : ''">
    <AppSidebarNode
      v-for="child in visibleChildren(item)"
      :key="child.id"
      :item="child"
      :collapsed="collapsed"
      :show-text="showText"
    />
  </el-menu-item-group>

  <template v-else>
    <el-menu-item
      :index="menuIndex(item)"
      :class="{ 'app-sidebar__menu-item--active': isActive(item) }"
      :disabled="item.disabled"
      @click="onItemClick(item)"
    >
      <template #default>
        <span class="app-sidebar__menu-label">
          <NavIcon :name="item.icon" class="app-sidebar__menu-icon" />
          <span v-if="showText" class="app-sidebar__menu-text">{{ item.title }}</span>
        </span>
      </template>
    </el-menu-item>
    <li v-if="showDividerAfter(item)" class="app-sidebar__node-divider" role="separator" aria-hidden="true" />
  </template>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import type { NavNode } from '@spark-view/spark-page-config/page/navigation'
import { useNav } from '@spark-view/spark-app'
import NavIcon from '@/components/NavIcon.vue'

const props = withDefaults(defineProps<{
  item: NavNode
  collapsed?: boolean
  showText?: boolean
}>(), {
  collapsed: false,
  showText: true,
})

const route = useRoute()
const nav = useNav()

function menuIndex(item: NavNode): string {
  return item.path ?? item.id
}

function shouldRenderAsSubMenu(item: NavNode): boolean {
  const children = visibleChildren(item)
  if (children.length === 0) return false
  if (!isDirectoryNode(item)) return false
  const placement = item.childPlacement
  if (placement === 'parent' || placement === 'flat') return true
  return children.some((child) => isDirectoryNode(child) && visibleChildren(child).length > 0)
}

function isDirectoryNode(item: NavNode): boolean {
  return item.nodeKind === 'module' || item.nodeKind === 'system-directory'
}

function isDirectoryGroupNode(item: NavNode): boolean {
  return isDirectoryNode(item) && visibleChildren(item).length > 0
}

function visibleChildren(item: NavNode): NavNode[] {
  return (item.children ?? []).filter((child) => !child.hidden && child.nodeKind !== 'sub-page')
}

function isActive(item: NavNode): boolean {
  return nav?.isNodeActive(item) ?? menuIndex(item) === route.path
}

function showDividerAfter(item: NavNode): boolean {
  return !props.collapsed && item.dividerAfter === true
}

function onItemClick(item: NavNode) {
  nav?.navigateTo(item)
}
</script>