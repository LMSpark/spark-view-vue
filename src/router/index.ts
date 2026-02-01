import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import DynamicPage from '../views/DynamicPage.vue'
import RendererDemoPage from '../views/RendererDemoPage.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: DynamicPage
  },
  {
    path: '/renderer-demo',
    name: 'RendererDemo',
    component: RendererDemoPage
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router