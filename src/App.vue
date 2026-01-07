<template>
  <div class="app-container">
    <!-- 左侧边栏 -->
    <div class="sidebar">
      <h2 style="color: #fff; margin-bottom: 20px;">管理后台</h2>
      <el-menu
        :default-active="$route.path"
        background-color="#001529"
        text-color="#fff"
        active-text-color="#1890ff"
        router
      >
        <el-menu-item 
          v-for="route in menuRoutes" 
          :key="route.path"
          :index="route.path"
        >
          <span>{{ route.meta?.icon }} {{ route.meta?.title }}</span>
        </el-menu-item>
      </el-menu>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRouter} from 'vue-router'

const router = useRouter()

// 从路由中获取菜单列表
const menuRoutes = computed(() => {
    return router.getRoutes().filter(route => route.meta?.title)
})
</script>

<style scoped>
.app-container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 200px;
  background: #001529;
  color: #fff;
  padding: 20px;
}

.main-content {
  flex: 1;
  padding: 20px;
  background: #f0f2f5;
}
</style>
