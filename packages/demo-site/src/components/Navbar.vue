<template>
  <nav class="navbar">
    <div class="navbar-brand">
      <h1>🚀 SPARK VIEW</h1>
      <span class="subtitle">DSL驱动的SSR/CSR框架</span>
    </div>

    <ul class="navbar-menu">
      <li v-for="item in menuItems" :key="item.path" class="menu-item">
        <router-link
          :to="item.path"
          :class="{ active: isActive(item.path) }"
          class="menu-link"
        >
          <span class="icon">{{ item.icon }}</span>
          <span class="label">{{ item.label }}</span>
        </router-link>
      </li>
    </ul>

    <div class="navbar-actions">
      <button class="btn-github" @click="openGithub">
        <span>⭐</span>
        GitHub
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

interface MenuItem {
  label: string;
  path: string;
  icon: string;
}

const route = useRoute();

const menuItems: MenuItem[] = [
  { label: '首页', path: '/home', icon: '🏠' },
  { label: 'DSL编辑器', path: '/editor', icon: '✏️' },
  { label: '列表页', path: '/list', icon: '📋' },
];

const isActive = (path: string): boolean => {
  return route.path === path;
};

const openGithub = (): void => {
  window.open('https://github.com/your-org/spark-view', '_blank');
};
</script>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 64px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  color: white;
}

.navbar-brand {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.navbar-brand h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 12px;
  opacity: 0.9;
  font-weight: 400;
}

.navbar-menu {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 8px;
}

.menu-item {
  position: relative;
}

.menu-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  text-decoration: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.menu-link:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.menu-link.active {
  background: rgba(255, 255, 255, 0.25);
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.icon {
  font-size: 16px;
}

.navbar-actions {
  display: flex;
  gap: 12px;
}

.btn-github {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-github:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-1px);
}

.btn-github span {
  font-size: 16px;
}
</style>
