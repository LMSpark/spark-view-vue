# 符号常量表使用指南

## 📋 概述

`@spark-view/spark-app` 的符号常量表提供了全局的常量定义，包括：
- 依赖注入 Symbol Keys
- 错误码
- 环境常量
- 权限常量
- 存储键名
- 默认配置
- 正则表达式

## 📦 导入方式

```typescript
import {
  // Symbol Keys
  APP_CONTEXT_KEY,
  ROUTER_KEY,
  
  // 错误码
  ErrorCodes,
  
  // 环境常量
  Environments,
  
  // 日志级别
  LogLevels,
  
  // 权限常量
  PermissionActions,
  
  // 存储键名
  StorageKeys,
  
  // 默认配置
  DefaultConfig,
  
  // 工具函数
  getErrorMessage,
  isProduction,
  getStorageItem,
  setStorageItem
} from '@spark-view/spark-app'
```

## 🔑 依赖注入 Symbol Keys

用于 Vue 的 provide/inject：

```typescript
import { inject } from 'vue'
import { APP_CONTEXT_KEY, ROUTER_KEY } from '@spark-view/spark-app'

// 注入应用上下文
const appContext = inject(APP_CONTEXT_KEY)

// 注入路由
const router = inject(ROUTER_KEY)
```

## ❌ 错误码

统一的错误码定义：

```typescript
import { ErrorCodes, getErrorMessage } from '@spark-view/spark-app'

// 使用错误码
if (!isAuthenticated) {
  throw new Error(getErrorMessage(ErrorCodes.AUTH_REQUIRED))
}

// 检查权限
if (!hasPermission) {
  return {
    code: ErrorCodes.PERMISSION_DENIED,
    message: getErrorMessage(ErrorCodes.PERMISSION_DENIED)
  }
}
```

错误码分类：
- `1xxx` - 认证相关
- `2xxx` - 权限相关
- `3xxx` - 网络相关
- `4xxx` - 配置相关
- `5xxx` - 路由相关
- `6xxx` - 数据相关
- `9xxx` - 系统错误

## 🌍 环境常量

```typescript
import { Environments, isProduction, isDevelopment } from '@spark-view/spark-app'

// 判断环境
if (isProduction()) {
  // 生产环境逻辑
}

if (isDevelopment()) {
  // 开发环境逻辑
}

// 直接使用常量
const env = import.meta.env.MODE
if (env === Environments.PRODUCTION) {
  // ...
}
```

## 🔐 权限常量

```typescript
import { PermissionActions, ResourceTypes } from '@spark-view/spark-app'

// 构建权限字符串
const permission = `${ResourceTypes.PAGE}:${PermissionActions.VIEW}`
// 结果: "page:view"

// 检查权限
if (user.permissions.includes(`page:${PermissionActions.CREATE}`)) {
  // 有创建页面权限
}
```

## 💾 本地存储

使用统一的存储键名：

```typescript
import { StorageKeys, getStorageItem, setStorageItem, removeStorageItem } from '@spark-view/spark-app'

// 存储用户信息
setStorageItem(StorageKeys.USER_INFO, {
  id: 1,
  name: '张三'
})

// 获取用户信息
const userInfo = getStorageItem<UserInfo>(StorageKeys.USER_INFO)

// 存储认证 token
setStorageItem(StorageKeys.AUTH_TOKEN, 'xxx')

// 移除 token
removeStorageItem(StorageKeys.AUTH_TOKEN)
```

## ⚙️ 默认配置

```typescript
import { DefaultConfig } from '@spark-view/spark-app'

// 使用默认配置
const config = {
  timeout: DefaultConfig.REQUEST_TIMEOUT,
  pageSize: DefaultConfig.PAGE_SIZE,
  loginPath: DefaultConfig.LOGIN_PATH
}

// API 请求超时
fetch('/api/users', {
  signal: AbortSignal.timeout(DefaultConfig.REQUEST_TIMEOUT)
})
```

## 🎯 事件常量

```typescript
import { AppEvents } from '@spark-view/spark-app'

// 发送事件
eventBus.emit(AppEvents.USER_LOGIN, { userId: 1 })

// 监听事件
eventBus.on(AppEvents.CONFIG_UPDATED, (config) => {
  console.log('配置已更新', config)
})
```

## 📝 正则表达式

```typescript
import { Patterns } from '@spark-view/spark-app'

// 验证邮箱
if (Patterns.EMAIL.test(email)) {
  console.log('邮箱格式正确')
}

// 验证手机号
if (Patterns.PHONE.test(phone)) {
  console.log('手机号格式正确')
}

// 验证权限格式
if (Patterns.PERMISSION.test('page:view')) {
  console.log('权限格式正确')
}
```

## 🎨 完整示例

```typescript
import {
  ErrorCodes,
  getErrorMessage,
  StorageKeys,
  getStorageItem,
  setStorageItem,
  DefaultConfig,
  LogLevels,
  appLogger
} from '@spark-view/spark-app'

// 用户登录
async function login(username: string, password: string) {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(DefaultConfig.REQUEST_TIMEOUT)
    })
    
    if (!response.ok) {
      throw new Error(getErrorMessage(ErrorCodes.AUTH_LOGIN_FAILED))
    }
    
    const { token, user } = await response.json()
    
    // 存储到本地
    setStorageItem(StorageKeys.AUTH_TOKEN, token)
    setStorageItem(StorageKeys.USER_INFO, user)
    
    appLogger.success('登录成功', { username })
    
    return { success: true }
  } catch (error) {
    appLogger.error('登录失败', { username, error })
    
    return {
      success: false,
      code: ErrorCodes.AUTH_LOGIN_FAILED,
      message: getErrorMessage(ErrorCodes.AUTH_LOGIN_FAILED)
    }
  }
}

// 检查认证状态
function isAuthenticated(): boolean {
  const token = getStorageItem(StorageKeys.AUTH_TOKEN)
  return !!token
}
```

## 🔄 类型安全

所有常量都有对应的 TypeScript 类型：

```typescript
import type {
  ErrorCode,
  Environment,
  LogLevel,
  PermissionAction,
  ResourceType,
  StorageKey,
  AppEvent
} from '@spark-view/spark-app'

function handleError(code: ErrorCode) {
  // code 必须是 ErrorCodes 中定义的值
}

function setLogLevel(level: LogLevel) {
  // level 必须是 LogLevels 中定义的值
}
```

## ✨ 最佳实践

1. **使用常量而非魔法字符串**
   ```typescript
   // ❌ 不好
   if (env === 'production') { }
   
   // ✅ 好
   if (env === Environments.PRODUCTION) { }
   ```

2. **使用 Symbol Keys 进行依赖注入**
   ```typescript
   // ✅ 类型安全的注入
   const context = inject(APP_CONTEXT_KEY)
   ```

3. **统一使用错误码**
   ```typescript
   // ✅ 统一的错误处理
   return {
     code: ErrorCodes.PERMISSION_DENIED,
     message: getErrorMessage(ErrorCodes.PERMISSION_DENIED)
   }
   ```

4. **使用工具函数**
   ```typescript
   // ✅ 使用封装的工具函数
   const userInfo = getStorageItem<UserInfo>(StorageKeys.USER_INFO)
   ```
