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
      active-text-color="#1890ff"
      :collapse="collapsed"
    >
      <template v-for="item in items" :key="item.id">
        <!-- 分割线 -->
        <el-divider v-if="item.type === 'divider'" />

        <!-- 分组标题 -->
        <el-menu-item-group v-else-if="item.type === 'group'" :title="collapsed ? '' : item.title">
          <el-menu-item
            v-for="child in visibleChildren(item)"
            :key="child.id"
            :index="child.path ?? child.id"
            :disabled="child.disabled"
            @click="onItemClick(child)"
          >
            <template #default>
              <span>{{ child.icon }} {{ collapsed ? '' : child.title }}</span>
            </template>
          </el-menu-item>
        </el-menu-item-group>

        <!-- 带子菜单的节点（parent / flat） -->
        <el-sub-menu v-else-if="hasNestedChildren(item)" :index="item.id">
          <template #title>
            <span>{{ item.icon }} {{ collapsed ? '' : item.title }}</span>
          </template>
          <el-menu-item
            v-for="child in visibleChildren(item)"
            :key="child.id"
            :index="child.path ?? child.id"
            :disabled="child.disabled"
            @click="onItemClick(child)"
          >
            <template #default>
              <span>{{ child.icon }} {{ child.title }}</span>
            </template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 普通菜单项 -->
        <el-menu-item
          v-else
          :index="item.path ?? item.id"
          :disabled="item.disabled"
          @click="onItemClick(item)"
        >
          <template #default>
            <span>{{ item.icon }} {{ collapsed ? '' : item.title }}</span>
          </template>
        </el-menu-item>
      </template>
    </el-menu>

    <!-- 兜底：无导航模型时读路由表 -->
    <el-menu
      v-else
      :default-active="$route.path"
      :background-color="'transparent'"
      text-color="var(--spark-sidebar-text)"
      active-text-color="#1890ff"
      :collapse="collapsed"
      router
    >
      <el-menu-item
        v-for="item in fallbackRoutes"
        :key="item.path"
        :index="item.path"
      >
        <template #default>
          <span>{{ item.meta?.['icon'] }} {{ collapsed ? '' : item.meta?.['title'] }}</span>
        </template>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { NavNode } from '@spark-view/spark-app'
import { useNav } from '@spark-view/spark-app'

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
  const cp = item.childPlacement
  return cp === 'parent' || cp === 'flat'
}

/** 过滤可见子项 */
function visibleChildren(item: NavNode): NavNode[] {
  return (item.children ?? []).filter((c) => !c.hidden)
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
}

.app-sidebar__logo {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
}

.app-sidebar__logo-text {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 1px;
}

.app-sidebar__logo-icon {
  font-size: 22px;
  font-weight: 700;
  color: #1890ff;
}

/* 透明背景让侧栏 CSS 变量生效 */
.app-sidebar :deep(.el-menu) {
  border-right: none;
}
</style>
