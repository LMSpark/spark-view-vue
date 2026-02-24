# JsonRenderer 迁移指南

## 概述

`JsonRenderer` 现已成为 `@spark-view/spark-component` 的标准组件，与 `PageRenderer` 同级。本文档说明如何将自建的 `JsonRendererDemo` 迁移到标准化的 `JsonRenderer`。

## 架构变化

### 之前（自建）
```
src/components/demo/JsonRendererDemo.vue  (应用层)
  ├── 手动 fetch 配置
  ├── 手动状态管理 (loading/error)
  ├── 手动提供 APP_SERVICES
  └── 直接渲染 UserGrid
```

### 之后（标准化）
```
packages/spark-component/src/renderer/JsonRenderer.vue  (组件系统层)
  ├── useJsonRenderer composable (逻辑封装)
  ├── 类型定义 (JsonRendererOptions)
  ├── 自动配置加载
  ├── 自动能力提供
  └── 插槽系统 (loading/error/content)
```

## 迁移步骤

### 步骤 1: 文件位置变化

| 原文件 | 新文件 | 层级 |
|--------|--------|------|
| `src/components/demo/JsonRendererDemo.vue` | `packages/spark-component/src/renderer/JsonRenderer.vue` | 组件系统 |
| - | `packages/spark-component/src/renderer/composables/useJsonRenderer.ts` | Composable |
| - | `packages/spark-component/src/renderer/types/index.ts` (JsonRendererOptions) | 类型定义 |

### 步骤 2: 代码对比

#### 原始代码 (JsonRendererDemo.vue - 110 行)

```vue
<template>
  <div style="background: white; padding: 20px;">
    <h3>📋 JSON 配置驱动渲染</h3>
    
    <div v-if="loading">加载中...</div>
    <div v-else-if="error">❌ 错误: {{ error }}</div>
    <div v-else>
      <el-collapse>
        <el-collapse-item title="📄 查看 JSON 配置">
          <pre>{{ JSON.stringify(config, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
      
      <component :is="UserGrid" v-if="config" :config="config" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSparkComponent } from '@spark-view/spark-component'
import { Logger, APP_SERVICES } from '@spark-view/spark-utils'
import UserGrid from './UserGrid.vue'

const loading = ref(true)
const error = ref('')
const config = ref(null)
const router = useRouter()
const logger = Logger('JsonRendererDemo')

const { provide: provideCapability } = useSparkComponent({
  type: 'json-renderer-demo-page',
  id: 'demo-page-root'
})

provideCapability(APP_SERVICES, {
  router: {
    push: (to) => router.push(to),
    replace: (to) => router.replace(to),
    back: () => router.back(),
    currentRoute: router.currentRoute.value
  },
  logger: {
    debug: (...args) => logger.debug(...args),
    info: (...args) => logger.info(...args),
    warn: (...args) => logger.warn(...args),
    error: (...args) => logger.error(...args)
  }
})

onMounted(async () => {
  try {
    const response = await fetch('/user-grid-demo.json')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    config.value = await response.json()
    loading.value = false
  } catch (e) {
    logger.error('加载配置失败:', e)
    error.value = e.message
    loading.value = false
  }
})
</script>
```

#### 标准化代码 (使用 JsonRenderer - 30 行)

```vue
<template>
  <div style="background: white; padding: 20px;">
    <h3>📋 JSON 配置驱动渲染</h3>
    
    <JsonRenderer 
      configUrl="/user-grid-demo.json"
      :component="UserGrid"
      show-config-viewer
    />
  </div>
</template>

<script setup lang="ts">
import { JsonRenderer } from '@spark-view/spark-component'
import UserGrid from './UserGrid.vue'
</script>
```

**代码减少 73%**，功能完全一致！

### 步骤 3: 功能对比

| 功能 | JsonRendererDemo (自建) | JsonRenderer (标准化) |
|------|------------------------|----------------------|
| 配置加载 | ✅ 手动 fetch | ✅ 自动处理 |
| 状态管理 | ✅ 手动 ref | ✅ 内置 |
| 错误处理 | ✅ try/catch | ✅ 自动 + 钩子 |
| APP_SERVICES | ✅ 手动提供 | ✅ 自动提供 |
| 配置查看器 | ✅ 手动实现 | ✅ showConfigViewer |
| 插槽定制 | ❌ 不支持 | ✅ 3个插槽 |
| 生命周期钩子 | ❌ 不支持 | ✅ beforeLoad/afterLoad/onError |
| 重新加载 | ❌ 需手动实现 | ✅ reload() 方法 |
| TypeScript | ⚠️ 部分 | ✅ 完整类型 |
| 可复用性 | ❌ 单一场景 | ✅ 通用组件 |

### 步骤 4: 迁移清单

- [x] 将 JsonRendererDemo 逻辑抽取到 useJsonRenderer composable
- [x] 创建 JsonRenderer.vue 纯视图组件
- [x] 定义 JsonRendererOptions 类型
- [x] 添加插槽系统 (loading/error/content)
- [x] 添加生命周期钩子 (beforeLoad/afterLoad/onError)
- [x] 移入 packages/spark-component/src/renderer/
- [x] 更新 renderer/index.ts 导出
- [x] 更新 spark-component/src/index.ts 导出
- [x] 编译验证 (通过)
- [x] ESLint 检查 (通过)
- [x] 创建使用文档
- [x] 创建迁移示例

## 使用示例

### 基础用法

```vue
<template>
  <!-- 最简单的用法 -->
  <JsonRenderer configUrl="/config.json" />
</template>

<script setup>
import { JsonRenderer } from '@spark-view/spark-component'
</script>
```

### 自定义插槽

```vue
<template>
  <JsonRenderer configUrl="/config.json">
    <template #loading>
      <div>⏳ 加载中...</div>
    </template>
    
    <template #error="{ error }">
      <div>❌ {{ error }}</div>
    </template>
  </JsonRenderer>
</template>
```

### 生命周期钩子

```vue
<template>
  <JsonRenderer 
    configUrl="/config.json"
    :before-load="checkAuth"
    :after-load="transformConfig"
    :on-error="reportError"
  />
</template>

<script setup>
async function checkAuth(url) {
  console.log('即将加载:', url)
}

function transformConfig(config) {
  return { ...config, theme: 'dark' }
}

function reportError(error) {
  console.error('错误:', error)
}
</script>
```

### 指定组件

```vue
<template>
  <JsonRenderer 
    :config="gridConfig"
    :component="UserGrid"
  />
</template>

<script setup>
import UserGrid from './UserGrid.vue'

const gridConfig = {
  type: 'user-grid',
  props: { ... }
}
</script>
```

## 更新路由（可选）

如果你的路由中引用了 `JsonRendererDemo`，可以更新为新的组件：

```typescript
// router/index.ts

// 之前
import JsonRendererDemo from '@/components/demo/JsonRendererDemo.vue'

// 之后
import JsonRendererExample from '@/components/demo/JsonRendererExample.vue'

const routes = [
  {
    path: '/json-demo',
    component: JsonRendererExample  // 使用标准化版本
  }
]
```

## 常见问题

### Q: 原来的 JsonRendererDemo 要删除吗？

A: 文件已在 2026-02-21 从仓库中移除。历史用户可以放心删除所有引用，
   也可在需要时参考迁移文档中的原始示例片段。

```markdown
# 注意
以下示例源自已删除的 `src/components/demo/JsonRendererDemo.vue`，
仅保留用于文档参考。
```  参考: packages/spark-component/src/renderer/JsonRenderer.vue
-->
```

### Q: 如果需要额外的逻辑怎么办？

A: 使用生命周期钩子：

```vue
<JsonRenderer 
  :after-load="(config) => {
    // 在这里添加你的逻辑
    return transformedConfig
  }"
/>
```

### Q: 如何传递额外的 props 给子组件？

A: 通过 `afterLoad` 钩子：

```vue
<JsonRenderer 
  :after-load="(config) => ({
    ...config,
    props: {
      ...config.props,
      currentUser: userInfo.value
    }
  })"
/>
```

### Q: 原来的 provide APP_SERVICES 逻辑还需要吗？

A: **不需要**。JsonRenderer 内部已经自动提供 APP_SERVICES，子组件可以直接消费：

```vue
<!-- UserGrid.vue -->
<script setup>
import { useSparkComponent } from '@spark-view/spark-component'

const { consume } = useSparkComponent({ type: 'user-grid' })
const services = consume(APP_SERVICES)  // 自动获取

services?.router?.push('/home')
services?.logger?.info('操作成功')
</script>
```

## 优势总结

1. ✅ **代码减少 73%**：从 110 行减少到 30 行
2. ✅ **类型安全**：完整的 TypeScript 类型定义
3. ✅ **可复用**：通用组件，任何场景都能用
4. ✅ **插槽系统**：灵活定制 UI
5. ✅ **生命周期**：beforeLoad/afterLoad/onError 钩子
6. ✅ **自动能力提供**：无需手动 provide APP_SERVICES
7. ✅ **标准化**：与 PageRenderer 同级，架构一致
8. ✅ **可维护**：逻辑 + 视图分离（useJsonRenderer + JsonRenderer.vue）

## 下一步

- 阅读完整文档：[docs/guides/JSON_RENDERER_GUIDE.md](./JSON_RENDERER_GUIDE.md)
- 查看示例代码：[src/components/demo/JsonRendererExample.vue](../../src/components/demo/JsonRendererExample.vue)
- 查看源代码：[packages/spark-component/src/renderer/JsonRenderer.vue](../../packages/spark-component/src/renderer/JsonRenderer.vue)

---

**迁移完成日期**: 2026-02-21  
**负责人**: SPARK Team
