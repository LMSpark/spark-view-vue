<template>
  <div class="app-sidebar">
    <div class="app-sidebar__logo">
      <span v-if="!collapsed" class="app-sidebar__logo-text">{{ title }}</span>
      <span v-else class="app-sidebar__logo-icon">S</span>
    </div>

    <!-- 导航模型驱动 -->
    <el-menu
      v-if="items.length"
      :default-active="activeIndex"
      :background-color="'transparent'"
      text-color="var(--spark-sidebar-text)"
      active-text-color="var(--el-color-primary)"
      :collapse="collapsed"
    >
      <template v-for="item in items" :key="item.id">
        <!-- 分组标题 -->
        <el-menu-item-group v-if="isDirectoryNode(item)" :title="collapsed ? '' : item.title">
          <template v-for="child in visibleChildren(item)" :key="child.id">
            <el-menu-item
              :index="child.path ?? child.id"
              :disabled="child.disabled"
              @click="onItemClick(child)"
            >
              <template #default>
                <span class="app-sidebar__menu-label">
                  <NavIcon :name="child.icon" class="app-sidebar__menu-icon" />
                  <span v-if="!collapsed" class="app-sidebar__menu-text">{{ child.title }}</span>
                </span>
              </template>
            </el-menu-item>
            <el-divider v-if="showDividerAfter(child)" class="app-sidebar__node-divider" />
          </template>
        </el-menu-item-group>
        <el-divider v-if="showDividerAfter(item)" class="app-sidebar__node-divider" />

        <!-- 带子菜单的节点（parent / flat） -->
        <el-sub-menu v-else-if="hasNestedChildren(item)" :index="item.id">
          <template #title>
            <span class="app-sidebar__menu-label">
              <NavIcon :name="item.icon" class="app-sidebar__menu-icon" />
              <span v-if="!collapsed" class="app-sidebar__menu-text">{{ item.title }}</span>
            </span>
          </template>
          <template v-for="child in visibleChildren(item)" :key="child.id">
            <el-menu-item
              :index="child.path ?? child.id"
              :disabled="child.disabled"
              @click="onItemClick(child)"
            >
              <template #default>
                <span class="app-sidebar__menu-label">
                  <NavIcon :name="child.icon" class="app-sidebar__menu-icon" />
                  <span class="app-sidebar__menu-text">{{ child.title }}</span>
                </span>
              </template>
            </el-menu-item>
            <el-divider v-if="showDividerAfter(child)" class="app-sidebar__node-divider" />
          </template>
        </el-sub-menu>
        <el-divider v-if="showDividerAfter(item)" class="app-sidebar__node-divider" />

        <!-- 普通菜单项 -->
        <el-menu-item
          v-else
          :index="item.path ?? item.id"
          :disabled="item.disabled"
          @click="onItemClick(item)"
        >
          <template #default>
            <span class="app-sidebar__menu-label">
              <NavIcon :name="item.icon" class="app-sidebar__menu-icon" />
              <span v-if="!collapsed" class="app-sidebar__menu-text">{{ item.title }}</span>
            </span>
          </template>
        </el-menu-item>
        <el-divider v-if="showDividerAfter(item)" class="app-sidebar__node-divider" />
      </template>
    </el-menu>

    <!-- 兜底：无导航模型时读路由表 -->
    <el-menu
      v-else
      :default-active="$route.path"
      :background-color="'transparent'"
      text-color="var(--spark-sidebar-text)"
      active-text-color="var(--el-color-primary)"
      :collapse="collapsed"
      router
    >
      <el-menu-item
        v-for="item in fallbackRoutes"
        :key="item.path"
        :index="item.path"
      >
        <template #default>
          <span class="app-sidebar__menu-label">
            <NavIcon :name="(item.meta?.['icon'] as string)" class="app-sidebar__menu-icon" />
            <span v-if="!collapsed" class="app-sidebar__menu-text">{{ item.meta?.['title'] }}</span>
          </span>
        </template>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { NavNode } from '@spark-view/spark-utils'
import { useNav } from '../navigation/useNavigation'
import NavIcon from '../components/NavIcon.vue'

const props = withDefaults(defineProps<{
  title?: string
  collapsed?: boolean
  items?: NavNode[]
}>(), {
  title: 'SPARK',
  collapsed: false,
  items: () => [],
})

const route = useRoute()
const router = useRouter()
const nav = useNav()

/** 活动高亮索引 */
const activeIndex = computed(() => route.path)

/** 判断节点是否需要渲染为 el-sub-menu */
function hasNestedChildren(item: NavNode): boolean {
  if (!item.children?.length) return false
  if (item.nodeKind !== 'module' && item.nodeKind !== 'system-directory') return false
  const cp = item.childPlacement
  return cp === 'parent' || cp === 'flat'
}

function isDirectoryNode(item: NavNode): boolean {
  return item.nodeKind === 'module' || item.nodeKind === 'system-directory'
}

/** 过滤可见子项 */
function visibleChildren(item: NavNode): NavNode[] {
  return (item.children ?? []).filter((c) => !c.hidden && c.nodeKind !== 'sub-page')
}

function showDividerAfter(item: NavNode): boolean {
  return !props.collapsed && item.dividerAfter === true
}

/** 菜单项点击 */
function onItemClick(item: NavNode) {
  nav?.navigateTo(item)
}

/* ── 兜底路由（无导航树时使用） ── */
const isRoutesLoaded = ref(false)
onMounted(() => { setTimeout(() => { isRoutesLoaded.value = true }, 100) })

const fallbackRoutes = computed(() => {
  if (props.items.length > 0) return []
  if (!isRoutesLoaded.value) return []
  return router.getRoutes()
    .filter(r => r.meta?.['title'] && r.path !== '/')
    .sort((a, b) => a.path.localeCompare(b.path))
})
</script>

<style scoped>
.app-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.app-sidebar__logo {
  margin-bottom: 8px;
  padding: 14px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--spark-sidebar-text) 16%, transparent);
  text-align: center;
}

.app-sidebar__logo-text {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1.2px;
}

.app-sidebar__logo-icon {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.app-sidebar__menu-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
}

.app-sidebar__menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-sidebar__menu-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 透明背景让侧栏 CSS 变量生效 */
.app-sidebar :deep(.el-menu) {
  border-right: none;
  padding: 0;
  background: transparent;
}

.app-sidebar :deep(.el-menu-item),
.app-sidebar :deep(.el-sub-menu__title) {
  height: 40px;
  line-height: 40px;
  margin: 4px 0;
  border-radius: 10px;
  padding: 0 12px !important;
}

.app-sidebar :deep(.el-menu-item:hover),
.app-sidebar :deep(.el-sub-menu__title:hover) {
  background: color-mix(in srgb, var(--spark-sidebar-text) 10%, transparent);
}

.app-sidebar :deep(.el-menu-item.is-active),
.app-sidebar :deep(.el-sub-menu .el-menu-item.is-active) {
  background: var(--el-color-primary-light-9);
  font-weight: 600;
}

.app-sidebar :deep(.el-menu--collapse .app-sidebar__menu-label) {
  justify-content: center;
}

.app-sidebar :deep(.el-menu-item-group__title) {
  color: color-mix(in srgb, var(--spark-sidebar-text) 75%, transparent);
  font-size: 12px;
  font-weight: 600;
}

.app-sidebar :deep(.app-sidebar__node-divider) {
  margin: 6px 10px;
  border-color: color-mix(in srgb, var(--spark-sidebar-text) 20%, transparent);
}
</style>
