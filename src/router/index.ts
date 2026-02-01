import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import DynamicPage from '../views/DynamicPage.vue'
import RendererDemo from '../../features/renderers/examples/RendererDemo.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: DynamicPage
  },
  {
    path: '/renderer-demo',
    name: 'RendererDemo',
    component: RendererDemo
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router