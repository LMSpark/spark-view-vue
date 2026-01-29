import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import Home from '../../pages/Home.vue'
import ProvideInject from '../../pages/ProvideInject.vue'
import StackedColumns from '../../pages/StackedColumns.vue'
import TypeSafety from '../../pages/TypeSafety.vue'
import EJ2GridDemo from '../../pages/EJ2GridDemo.vue'
import EJ2NativeDemo from '../../pages/EJ2NativeDemo.vue'
import SparkEJ2Demo from '../../pages/SparkEJ2Demo.vue'
import SparkDemo from '../../pages/SparkDemo.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/provide-inject',
    name: 'provide-inject',
    component: ProvideInject,
    meta: {
      title: '主动provide/inject架构'
    }
  },
  {
    path: '/stacked-columns',
    name: 'stacked-columns',
    component: StackedColumns,
    meta: {
      title: '多级表头'
    }
  },
  {
    path: '/type-safety',
    name: 'type-safety',
    component: TypeSafety,
    meta: {
      title: 'TypeScript类型安全'
    }
  },
  {
    path: '/ej2-grid-demo',
    name: 'ej2-grid-demo',
    component: EJ2GridDemo,
    meta: {
      title: 'EJ2 Grid组件演示'
    }
  },
  {
    path: '/ej2-native-demo',
    name: 'ej2-native-demo',
    component: EJ2NativeDemo,
    meta: {
      title: 'EJ2 原生组件演示'
    }
  },
  {
    path: '/spark-ej2-demo',
    name: 'spark-ej2-demo',
    component: SparkEJ2Demo,
    meta: {
      title: 'SPARK EJ2 组件演示'
    }
  },
  {
    path: '/spark-demo',
    name: 'spark-demo',
    component: SparkDemo,
    meta: {
      title: 'SPARK 架构演示'
    }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router