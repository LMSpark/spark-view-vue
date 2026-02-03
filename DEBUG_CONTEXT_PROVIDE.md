# APP_CONTEXT 重复提供问题诊断

## 警告信息
```
AppContext.js:24  [Vue warn]: App already provides property with key "Symbol(AppContext)". 
It will be overwritten with the new value.
```

## 调用堆栈分析
```
provideAppContext @ AppContext.js:24
bootstrap @ index.js:93
start @ start.js:92
(匿名) @ main.ts:56
```

## 可能的原因

### ✅ 已排除
1. ~~bootstrap/index.ts 中的 `provideAppContext(app, appContext)` 调用~~ - 已移除
2. ~~编译后的代码仍包含调用~~ - 检查过，没有

### 🔍 需要检查

1. **浏览器缓存问题**
   - Vite 热更新可能使用旧的编译文件
   - 解决方案：硬刷新（Ctrl+Shift+R）或清除缓存

2. **Symbol 相同但来自不同模块**
   - 如果 `@spark-view/spark-app` 被多次加载，会创建不同的 Symbol 实例
   - 即使名字相同 `Symbol('AppContext')`，它们也是不同的对象

3. **Vite 依赖预优化**
   - Vite 可能缓存了旧版本的依赖
   - 解决方案：删除 `node_modules/.vite` 目录

## 诊断步骤

### 1. 清除所有缓存
```powershell
# 删除 Vite 缓存
Remove-Item -Recurse -Force node_modules/.vite

# 删除浏览器缓存（Chrome）
# DevTools > Network > Disable cache
# 然后 Ctrl+Shift+R 硬刷新
```

### 2. 重新编译所有包
```powershell
cd packages/spark-app
pnpm run build

cd ../spark-core  
pnpm run build

cd ../..
```

### 3. 重启开发服务器
```powershell
# 完全停止旧的 dev server
# 然后重新启动
pnpm run dev
```

### 4. 检查运行时 Symbol
在浏览器控制台运行：
```javascript
// 查看所有 provide 的 keys
const app = window.__app__
if (app && app._context) {
  const provides = app._context.provides
  console.log('All provided keys:', Object.getOwnPropertySymbols(provides))
  
  // 查找 AppContext 相关的 Symbol
  const appContextSymbols = Object.getOwnPropertySymbols(provides).filter(
    s => s.toString().includes('AppContext')
  )
  console.log('AppContext symbols:', appContextSymbols)
  console.log('Count:', appContextSymbols.length) // 应该只有 1 个
}
```

### 5. 检查模块加载
```javascript
// 检查是否有重复的模块实例
console.log('Modules loaded:', performance.getEntriesByType('resource')
  .filter(r => r.name.includes('spark-app'))
  .map(r => r.name)
)
```

## 当前代码状态

### bootstrap/index.ts (正确✅)
```typescript
// 第 105 行 - 只提供一次
app.provide(APP_CONTEXT_KEY, appContext)
```

### AppContext.ts (导出但未调用✅)
```typescript
// 第 34 行 - 函数定义，但在 spark-app 内部没有被调用
export function provideAppContext(app: App, context: AppContext): void {
  app.provide(APP_CONTEXT_KEY, context)
}
```

## 预期行为
- `APP_CONTEXT_KEY` 应该只被 provide 一次
- 在 `bootstrap()` 的第 105 行

## 下一步
如果清除缓存后警告仍然存在，需要：
1. 在 `bootstrap/index.ts` 第 105 行前添加日志
2. 检查是否还有其他插件或中间件在 provide APP_CONTEXT_KEY
3. 使用 debugger 断点追踪实际执行流程
