# 简化注册 API ⚡

> 告别繁琐配置，一行代码搞定组件注册

## 问题

旧 API 太繁琐：
```typescript
❌ 旧 API - 需要手动指定很多配置
Spark.registerSparkComponent({
  type: 'demo-heavy-grid',          // 手动 kebab-case
  name: '重量级表格',                 // 重复信息
  version: '1.0.0',                  // 手动版本
  loader: () => import('./HeavyGrid.vue')  // 手动 loader
})
```

## 解决方案

新 API - 自动处理一切：
```typescript
✅ 新 API - 只需要必要信息
Spark.easy.register({
  name: 'HeavyGrid',                 // 自动转 type: 'heavy-grid'
  path: './HeavyGrid.vue',
  lazy: true,                        // 是否懒加载
  onLoad: (comp) => console.log('Loaded!')  // 可选回调
})
```

---

## API 参考

### Spark.easy.register()

注册单个组件（简化版）

```typescript
interface SimpleComponentConfig {
  name: string              // 组件名称（自动转 kebab-case）
  path?: string             // 组件路径（懒加载时）
  component?: unknown       // 组件本身（同步加载时）
  lazy?: boolean            // 是否懒加载（默认 false）
  version?: string          // 版本号（默认 '1.0.0'）
  onLoad?: (comp) => void   // 加载完成回调
  provides?: string[]       // 提供的能力
  requires?: string[]       // 依赖的能力
}

Spark.easy.register(config)
```

### Spark.easy.registerAll()

批量注册组件

```typescript
Spark.easy.registerAll([
  { name: 'Chart', path: './Chart.vue', lazy: true },
  { name: 'Calendar', path: './Calendar.vue', lazy: true },
  { name: 'Grid', path: './Grid.vue', lazy: true }
])
```

### Spark.easy.presets

预设配置生成器

```typescript
// 懒加载预设
const config = Spark.easy.presets.lazy(
  'HeavyGrid', 
  './HeavyGrid.vue'
)

// 同步加载预设
const config = Spark.easy.presets.sync(
  'Button',
  ButtonComponent
)

// 带能力的组件
const config = Spark.easy.presets.withCapabilities(
  'Grid',
  './Grid.vue',
  ['data-source', 'column-manager'],  // provides
  ['selection']                        // requires
)
```

---

## 使用示例

### 1. 最简单的懒加载

```typescript
import { Spark } from '@spark-view/spark-component'

Spark.easy.register({
  name: 'HeavyChart',
  path: './components/HeavyChart.vue',
  lazy: true
})

// 使用
<SparkComponentRenderer :config="{ type: 'heavy-chart' }" />
```

### 2. 带加载回调

```typescript
Spark.easy.register({
  name: 'Calendar',
  path: './Calendar.vue',
  lazy: true,
  onLoad: (component) => {
    console.log('✅ Calendar loaded!', component)
    // 可以在这里做一些初始化
  }
})
```

### 3. 同步注册

```typescript
import MyButton from './MyButton.vue'

Spark.easy.register({
  name: 'MyButton',
  component: MyButton  // 直接传组件，不懒加载
})
```

### 4. 批量注册

```typescript
// 定义组件列表
const lazyComponents = [
  { name: 'Chart', path: './Chart.vue' },
  { name: 'Calendar', path: './Calendar.vue' },
  { name: 'Grid', path: './Grid.vue' },
  { name: 'Tree', path: './Tree.vue' }
]

// 一次性注册，全部懒加载
Spark.easy.registerAll(
  lazyComponents.map(c => ({ ...c, lazy: true }))
)
```

### 5. 使用预设

```typescript
// 懒加载预设
Spark.easy.register(
  Spark.easy.presets.lazy('HeavyGrid', './HeavyGrid.vue')
)

// 同步加载预设
Spark.easy.register(
  Spark.easy.presets.sync('Button', ButtonComponent)
)

// 带能力的组件
Spark.easy.register(
  Spark.easy.presets.withCapabilities(
    'Grid',
    './Grid.vue',
    ['data-source'],  // provides
    ['selection']     // requires
  )
)
```

### 6. 组合使用

```typescript
// 小组件 - 同步加载
Spark.easy.registerAll([
  { name: 'Button', component: ButtonComponent },
  { name: 'Input', component: InputComponent },
  { name: 'Select', component: SelectComponent }
])

// 大组件 - 懒加载
Spark.easy.registerAll([
  { 
    name: 'HeavyGrid', 
    path: './HeavyGrid.vue', 
    lazy: true,
    onLoad: () => console.log('Grid ready')
  },
  { 
    name: 'Chart', 
    path: './Chart.vue', 
    lazy: true 
  }
])
```

---

## 自动转换规则

### 名称 → 类型（kebab-case）

```typescript
'Button'         → 'button'
'HeavyGrid'      → 'heavy-grid'
'SparkEJ2Grid'   → 'spark-ej2-grid'
'MyCustomButton' → 'my-custom-button'
```

### 实现

```typescript
import { nameToType } from '@spark-view/spark-component'

nameToType('HeavyGrid')  // 'heavy-grid'
```

---

## 对比

| 特性 | 旧 API | 新 API (Spark.easy) |
|------|--------|---------------------|
| **类型名称** | 手动 kebab-case | 自动转换 |
| **版本号** | 手动指定 | 默认 '1.0.0' |
| **懒加载** | 手动写 loader | 指定 lazy: true |
| **加载回调** | 无 | onLoad() |
| **代码行数** | 6-8 行 | 3-4 行 |
| **易用性** | ⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 迁移指南

### 迁移步骤

1. **替换 API 调用**
   ```typescript
   // 旧代码
   Spark.registerSparkComponent({
     type: 'my-component',
     name: 'My Component',
     version: '1.0.0',
     loader: () => import('./MyComponent.vue')
   })
   
   // 新代码
   Spark.easy.register({
     name: 'MyComponent',
     path: './MyComponent.vue',
     lazy: true
   })
   ```

2. **批量迁移**
   ```typescript
   // 旧代码
   components.forEach(comp => {
     Spark.registerSparkComponent({
       type: comp.type,
       loader: () => import(comp.path)
     })
   })
   
   // 新代码
   Spark.easy.registerAll(
     components.map(c => ({
       name: c.name,
       path: c.path,
       lazy: true
     }))
   )
   ```

### 兼容性

- ✅ 新旧 API 可以共存
- ✅ 渐进式迁移
- ✅ 不影响现有代码

---

## 常见问题

### Q: 我想自定义 type 怎么办？

A: 使用旧 API `Spark.registerSparkComponent()`，新 API 主要用于标准场景。

### Q: 加载失败会怎样？

A: loader 抛出错误，可以在 onLoad 中处理或使用 try/catch。

### Q: onLoad 回调的参数是什么？

A: 加载完成的组件对象（module.default）。

### Q: 能同时注册 component 和 path 吗？

A: 不推荐。如果有 component，path 会被忽略。

---

## 完整示例

```typescript
import { Spark } from '@spark-view/spark-component'

// 1. 简单懒加载
Spark.easy.register({
  name: 'MyChart',
  path: './MyChart.vue',
  lazy: true
})

// 2. 带回调
Spark.easy.register({
  name: 'HeavyGrid',
  path: './HeavyGrid.vue',
  lazy: true,
  onLoad: (comp) => console.log('Grid loaded!', comp)
})

// 3. 同步加载
import Button from './Button.vue'
Spark.easy.register({
  name: 'Button',
  component: Button
})

// 4. 批量注册
Spark.easy.registerAll([
  { name: 'Chart', path: './Chart.vue', lazy: true },
  { name: 'Calendar', path: './Calendar.vue', lazy: true },
  { name: 'Tree', path: './Tree.vue', lazy: true }
])

// 5. 使用预设
Spark.easy.register(
  Spark.easy.presets.lazy('Gantt', './Gantt.vue')
)
```

---

**文档**：
- [动态导入完整指南](./DYNAMIC_IMPORT.md)
- [快速参考](./DYNAMIC_IMPORT_QUICK_REF.md)
- [API 参考](./API_REFERENCE.md)
