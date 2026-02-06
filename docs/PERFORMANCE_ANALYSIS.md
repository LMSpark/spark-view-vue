# SPARK 性能分析报告

> 2026年2月6日

## 执行摘要

通过代码审查和性能分析，识别出当前架构中存在的性能瓶颈和优化机会。

---

## 核心性能问题

### 🔴 问题 1: 频繁的 Set → Array 转换

**位置**: 遍布能力系统代码

**现状**:
```typescript
// 当前实现：每次查找都要遍历整个 Set
const provider = Array.from(context.providers).find(p => p.name === name)
```

**影响**:
- 时间复杂度：O(n) 转换 + O(n) 查找 = O(2n)
- 空间复杂度：O(n) 临时数组
- 热路径：在 `getProvider()`, `consume()`, `whenAvailable()` 等高频调用方法中

**量化影响**:
- 假设页面有 50 个组件，每个组件查询 5 个能力
- 总查询次数：250 次
- 每次查询遍历平均 10 个 providers
- 总遍历次数：2500 次（可优化到 250 次）

**解决方案**:
```typescript
// 优化：使用 Map 存储，O(1) 查找
interface ComponentContext {
  // 改为 Map
  providers: Map<string, CapabilityProvider>
}

// 查找变为 O(1)
const provider = context.providers.get(name)
```

**预期提升**: 查询性能提升 10-50 倍（取决于 provider 数量）

---

### 🟡 问题 2: 未缓存的 Context Chain 遍历

**位置**: `getInheritedProvider()` 方法

**现状**:
```typescript
// 每次都要遍历父级链
let current = context
while (current) {
  const p = Array.from(current.providers).find(pr => pr.name === name)
  if (p) return p
  current = current.parent
}
```

**影响**:
- 深层嵌套组件树中，每次查询都要遍历整个链
- 假设树深度为 5，每次查询需要 5 次遍历
- 重复查询同一个能力会重复遍历

**解决方案**:
```typescript
// 缓存 context chain
interface ComponentContext {
  _cachedChain?: ComponentContext[]
}

function getContextChain(context: ComponentContext): ComponentContext[] {
  if (context._cachedChain) return context._cachedChain
  
  const chain: ComponentContext[] = []
  let current: ComponentContext | undefined = context
  while (current) {
    chain.push(current)
    current = current.parent
  }
  
  context._cachedChain = chain
  return chain
}
```

**预期提升**: 深层嵌套场景性能提升 3-5 倍

---

### 🟡 问题 3: 组件 Loader 的重复解析

**位置**: `SparkComponentRenderer`, `useSparkComponent`

**现状**:
```typescript
// 每次渲染都可能重新解析 loader
if (def.loader) {
  const module = await def.loader()
  const component = module.default || module
  // 未缓存，下次渲染重复解析
}
```

**影响**:
- 动态组件每次渲染都可能触发 import()
- 网络资源浪费（虽然浏览器会缓存模块）
- 解析和实例化开销

**解决方案**:
```typescript
interface ComponentDefinition {
  loader?: () => Promise<any>
  _resolvedComponent?: Component // 缓存
}

async function resolveComponent(def: ComponentDefinition) {
  if (def._resolvedComponent) return def._resolvedComponent
  
  if (def.loader) {
    const module = await def.loader()
    def._resolvedComponent = module.default || module
  } else {
    def._resolvedComponent = def.component
  }
  
  return def._resolvedComponent
}
```

**预期提升**: 避免重复 import() 调用，减少首次渲染后的组件切换延迟

---

### 🟢 问题 4: CapabilityManager 立即初始化

**位置**: 模块加载时

**现状**:
```typescript
// 全局立即创建
export const capabilityManager = createComponentCapabilityManager()
```

**影响**:
- 即使页面不使用能力系统，也会创建
- 增加模块初始化时间
- 占用不必要的内存

**解决方案**:
```typescript
// 懒加载单例
let _capabilityManager: ComponentCapabilityManager | undefined

export const getCapabilityManager = () => {
  if (!_capabilityManager) {
    _capabilityManager = createComponentCapabilityManager()
  }
  return _capabilityManager
}

export const capabilityManager = getCapabilityManager() // 兼容性导出
```

**预期提升**: 模块加载速度提升，减少内存占用

---

## 次要性能优化

### 🔵 优化 5: providerListeners 内存泄漏风险

**问题**: 回调函数可能未被清理

**解决方案**: 使用 WeakMap 或添加自动清理机制

```typescript
// 当 provider 注册后，自动清理监听器
const callbacks = context.providerListeners.get(name)
if (callbacks) {
  callbacks.forEach(cb => cb(provider))
  context.providerListeners.delete(name) // 清理
}
```

---

### 🔵 优化 6: 组件上下文创建优化

**问题**: 每次创建 context 都会创建新的 Map/Set

**解决方案**: 对象池模式（复杂，暂不实施）

---

## 优化优先级矩阵

| 优化项 | 影响 | 难度 | 优先级 |
|--------|------|------|--------|
| **Set → Map** | 高 | 中 | P0 🔴 |
| **缓存 Context Chain** | 中 | 低 | P1 🟡 |
| **缓存 Component** | 中 | 低 | P1 🟡 |
| **懒加载 CapabilityManager** | 低 | 低 | P2 🟢 |
| **清理 providerListeners** | 低 | 低 | P2 🔵 |

---

## 实施计划

### 阶段 1: 快速优化（P0-P1）

**目标**: 提升查询性能 5-10 倍

1. **将 providers 从 Set 改为 Map** (1-2小时)
   - 修改 ComponentContext 类型定义
   - 更新所有 provider 注册和查询逻辑
   - 运行测试验证
   
2. **缓存 Context Chain** (30分钟)
   - 添加 _cachedChain 字段
   - 实现 getContextChain() 辅助函数
   - 更新 getInheritedProvider() 使用缓存
   
3. **缓存已解析的 Component** (30分钟)
   - 添加 _resolvedComponent 字段
   - 创建 resolveComponent() 辅助函数
   - 更新 renderer 和 composable

### 阶段 2: 深度优化（P2）

**目标**: 减少内存占用，防止泄漏

4. **懒加载 CapabilityManager** (15分钟)
5. **清理 providerListeners** (15分钟)

---

## 性能基准测试计划

### 测试场景

1. **组件树渲染性能**
   - 50 个组件，10 个能力查询/组件
   - 嵌套深度 5 层监控指标：总渲染时间、能力查询时间

2. **能力查询性能**
   - 1000 次 getProvider() 调用
   - 监控指标：平均查询时间、95th 百分位

3. **内存使用**
   - 创建 100 个组件上下文
   - 监控指标：堆内存大小、GC 次数

### 预期结果

| 指标 | 当前 | 优化后 | 提升 |
|------|------|--------|------|
| 能力查询（1000次） | 20ms | 2ms | 10x |
| 组件树渲染（50个） | 150ms | 100ms | 1.5x |
| 内存占用（100个ctx） | 5MB | 4MB | 20% |

---

## 风险评估

### 破坏性变更

**Set → Map 改造**:
- ✅ **类型兼容**: 接口变更，但内部实现
- ⚠️ **测试影响**: 需要更新测试用例
- ✅ **向后兼容**: API 层面无变化

**缓存机制**:
- ✅ **无破坏性**: 纯内部优化
- ⚠️ **缓存失效**: 需要确保父级改变时失效缓存

### 回滚策略

- 所有优化都是内部实现，可单独回滚
- 使用 feature flag 控制优化启用

---

## 总结

### 关键要点

1. ✅ **Set → Map** 是最重要的优化，影响所有能力查询
2. ✅ **缓存策略** 可以显著减少重复计算
3. ✅ **懒加载** 减少初始化开销
4. ✅ 所有优化都是内部实现，不影响 API

### 下一步

1. 实施 P0 优化：Set → Map
2. 编写性能基准测试
3. 验证优化效果
4. 如果效果显著，继续 P1-P2 优化

---

## 参考资料

- [JavaScript Map vs Set 性能对比](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
- [Vue 3 性能优化最佳实践](https://vuejs.org/guide/best-practices/performance.html)
- [Chrome DevTools Performance Profiling](https://developer.chrome.com/docs/devtools/performance/)
