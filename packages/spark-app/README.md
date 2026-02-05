# @spark-view/spark-app

> SPARK 应用层基础设施 - 提供应用上下文、路由守卫、错误处理和日志系统

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-green.svg)](https://vuejs.org/)

## 特性

-  **Bootstrap** - 应用初始化流水线
-  **Router Guards** - 鉴权和权限检查
-  **Error Boundary** - 全局错误处理
-  **Config Manager** - 环境变量和远程配置
-  **Logger** - 多级别、多传输器日志系统

## 安装

\\\ash
pnpm add @spark-view/spark-app
\\\

## 快速开始

### 1. 初始化应用

\\\	ypescript
import { createApp } from 'vue'
import { SparkApp } from '@spark-view/spark-app'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// 使用 SparkApp 初始化
SparkApp.bootstrap({
  app,
  router,
  config: {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    logLevel: import.meta.env.DEV ? 'debug' : 'warn'
  },
  beforeMount: async (context) => {
    // 自定义初始化逻辑
    console.log('应用即将挂载', context)
  }
})
\\\

### 2. 使用日志系统

\\\	ypescript
import { Logger } from '@spark-view/spark-app'

const logger = Logger.create({
  level: 'info',
  transports: [
    Logger.consoleTransport(),
    Logger.httpTransport({ url: '/api/logs' })
  ]
})

logger.info('应用启动')
logger.error('错误信息', { code: 500 })
\\\

### 3. 配置管理

\\\	ypescript
import { ConfigManager } from '@spark-view/spark-app'

// 设置配置
ConfigManager.set('apiUrl', 'https://api.example.com')

// 获取配置
const apiUrl = ConfigManager.get('apiUrl')

// 批量设置
ConfigManager.merge({
  apiUrl: 'https://api.example.com',
  timeout: 5000
})
\\\

### 4. 路由守卫

\\\	ypescript
import { createAuthGuard } from '@spark-view/spark-app'

// 添加鉴权守卫
router.beforeEach(createAuthGuard({
  loginPath: '/login',
  isAuthenticated: () => !!localStorage.getItem('token')
}))
\\\

## 核心模块

### AppContext

应用级上下文（用户、租户、环境）

\\\	ypescript
import { AppContext } from '@spark-view/spark-app'

const context = AppContext.create({
  user: { id: 1, name: 'Alice' },
  tenant: { id: 'tenant-1' },
  env: 'production'
})
\\\

### Error Boundary

全局错误处理与降级

\\\ue
<template>
  <ErrorBoundary @error=&quot;handleError&quot;>
    <YourComponent />
  </ErrorBoundary>
</template>

<script setup>
import { ErrorBoundary } from '@spark-view/spark-app'

function handleError(error) {
  console.error('组件错误:', error)
}
</script>
\\\

### Logger 特性

-  完全独立实现（不依赖 spark-core）
-  多级别：debug、info、warn、error
-  多传输器：console、HTTP、memory
-  作用域隔离：page、api、custom

## API 文档

完整 API 文档请查看 [API.md](./API.md)

## 依赖

\\\json
{
  &quot;vue&quot;: &quot;^3.4.0&quot;,
  &quot;vue-router&quot;: &quot;^4.2.0&quot;
}
\\\

## 开发命令

\\\ash
pnpm run typecheck   # 类型检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
\\\

## License

MIT