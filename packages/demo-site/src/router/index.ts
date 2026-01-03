/**
 * Vue Router 配置
 */
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Home from '../views/Home.vue';
import List from '../views/List.vue';
import Detail from '../views/Detail.vue';
import DslEditor from '../views/DslEditor.vue';
import HybridDemo from '../views/HybridDemo.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/home',
    name: 'home',
    component: Home,
    meta: {
      title: '首页',
      icon: '🏠',
    },
  },
  {
    path: '/editor',
    name: 'editor',
    component: DslEditor,
    meta: {
      title: 'DSL 编辑器',
      icon: '✏️',
    },
  },
  {
    path: '/designer',
    name: 'page-designer',
    component: () => import('../views/PageDesigner.vue'),
    meta: {
      title: '页面设计器',
      icon: '🎨',
    },
  },
  {
    path: '/hybrid',
    name: 'hybrid',
    component: HybridDemo,
    meta: {
      title: '混合架构演示',
      icon: '🚀',
    },
  },
  {
    path: '/list',
    name: 'list',
    component: List,
    meta: {
      title: '列表页',
      icon: '📋',
    },
  },
  {
    path: '/detail/:id',
    name: 'detail',
    component: Detail,
    meta: {
      title: '详情页',
      icon: '📄',
    },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫 - 更新页面标题
router.beforeEach((to, _from, next) => {
  const title = to.meta.title as string;
  if (title) {
    document.title = `${title} - SPARK VIEW`;
  }
  next();
});

export default router;
