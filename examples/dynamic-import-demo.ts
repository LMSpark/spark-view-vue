/**
 * SPARK 动态导入功能演示
 * 
 * 运行方式：
 * pnpm tsx examples/dynamic-import-demo.ts
 */

/* eslint-disable no-console */

import { Spark } from '../packages/spark-component/src/spark-namespace.js'

console.log('🚀 SPARK 动态导入功能演示\n')

// ============================================
// 1. 基础演示：注册懒加载组件
// ============================================

console.log('📦 1. 注册懒加载组件')

// 模拟懒加载组件（实际项目中是 import('./Component.vue')）
const mockHeavyGridLoader = () => Promise.resolve({
  default: {
    name: 'HeavyGrid',
    render() { return '重量级表格组件' }
  }
})

const mockChartLoader = () => Promise.resolve({
  default: {
    name: 'Chart',
    render() { return '图表组件' }
  }
})

// 注册懒加载组件
Spark.registerSparkComponent({
  type: 'spark-heavy-grid',
  name: '重量级表格',
  version: '1.0.0',
  loader: mockHeavyGridLoader
})

Spark.registerSparkComponent({
  type: 'spark-chart',
  name: '图表组件',
  version: '1.0.0',
  loader: mockChartLoader
})

console.log('✅ 已注册 2 个懒加载组件\n')

// ============================================
// 2. 异步获取组件（自动加载）
// ============================================

console.log('📥 2. 异步获取组件（首次会触发加载）')

async function demoGetAsync() {
  const registry = Spark.registry()
  
  // 首次获取 - 会触发 loader
  console.log('  首次获取 spark-heavy-grid...')
  const start1 = Date.now()
  const def1 = await registry.getAsync('spark-heavy-grid')
  console.log(`  ✅ 加载完成（耗时 ${Date.now() - start1}ms）`)
  console.log(`  组件名称: ${def1?.name}, 已加载: ${!!def1?.component}\n`)
  
  // 第二次获取 - 直接返回缓存
  console.log('  第二次获取 spark-heavy-grid...')
  const start2 = Date.now()
  const def2 = await registry.getAsync('spark-heavy-grid')
  console.log(`  ✅ 直接返回缓存（耗时 ${Date.now() - start2}ms）`)
  console.log(`  组件名称: ${def2?.name}, 已加载: ${!!def2?.component}\n`)
}

await demoGetAsync()

// ============================================
// 3. 批量预加载
// ============================================

console.log('🔄 3. 批量预加载多个组件')

async function demoPreload() {
  const registry = Spark.registry()
  
  console.log('  预加载 spark-chart...')
  const start = Date.now()
  await registry.preload(['spark-chart'])
  console.log(`  ✅ 预加载完成（耗时 ${Date.now() - start}ms）\n`)
  
  // 验证已加载
  const def = registry.get('spark-chart')
  console.log(`  验证: spark-chart 已加载 = ${!!def?.component}\n`)
}

await demoPreload()

// ============================================
// 4. 同步注册 vs 异步注册对比
// ============================================

console.log('⚡ 4. 同步 vs 异步注册对比')

// 同步注册（立即加载）
Spark.registerSparkComponent({
  type: 'spark-button',
  name: '按钮组件',
  component: { name: 'Button', render() { return 'Button' } }
})

const buttonDef = Spark.registry().get('spark-button')
console.log(`  同步注册: spark-button`)
console.log(`    - 注册后立即可用: ${!!buttonDef?.component}`)
console.log(`    - 无需 await\n`)

// 异步注册（懒加载）
const lazyButtonDef = Spark.registry().get('spark-heavy-grid')
console.log(`  异步注册: spark-heavy-grid`)
console.log(`    - 注册后 component = ${lazyButtonDef?.component ? 'loaded' : 'null'}`)
console.log(`    - loader = ${typeof lazyButtonDef?.loader}`)
console.log(`    - 需要 await getAsync() 才会加载\n`)

// ============================================
// 5. 实战场景：路由级分包模拟
// ============================================

console.log('🎯 5. 实战场景：路由级分包')

interface RouteConfig {
  name: string
  components: string[]
}

const routes: RouteConfig[] = [
  { name: 'dashboard', components: ['spark-chart', 'spark-kpi'] },
  { name: 'data-analysis', components: ['spark-heavy-grid', 'spark-pivot'] }
]

// 注册所有组件
Spark.registerSparkComponent({
  type: 'spark-kpi',
  loader: () => Promise.resolve({ default: { name: 'KPI' } })
})

Spark.registerSparkComponent({
  type: 'spark-pivot',
  loader: () => Promise.resolve({ default: { name: 'Pivot' } })
})

// 模拟路由切换
async function navigateTo(routeName: string) {
  console.log(`\n  导航到: ${routeName}`)
  const route = routes.find(r => r.name === routeName)
  if (!route) return
  
  console.log(`  页面需要: ${route.components.join(', ')}`)
  const start = Date.now()
  
  // 预加载页面所需的所有组件
  await Spark.registry().preload(route.components)
  
  console.log(`  ✅ 所有组件已就绪（耗时 ${Date.now() - start}ms）`)
}

await navigateTo('dashboard')
await navigateTo('data-analysis')

// ============================================
// 6. 性能对比
// ============================================

console.log('\n\n📊 6. 性能对比总结')

console.log(`
  传统方式（全部同步加载）：
    - 首屏加载所有组件（假设 10 个组件 * 100KB = 1MB）
    - 首屏加载时间: ~3000ms
    - 用户等待时间长
  
  动态导入（按需加载）：
    - 首屏只加载必要组件（2 个 * 100KB = 200KB）
    - 首屏加载时间: ~600ms（提速 80%）
    - 其他组件在需要时加载
    - 用户体验显著提升
`)

console.log('✨ 演示完成！\n')

// ============================================
// 7. 查看当前注册状态
// ============================================

console.log('📋 当前注册的组件：')
const registry = Spark.registry()
const allTypes = registry.getAllTypes()

allTypes.forEach(type => {
  const def = registry.get(type)
  const status = def?.component 
    ? '✅ 已加载' 
    : def?.loader 
      ? '⏳ 待加载' 
      : '❓ 未知'
  console.log(`  - ${type}: ${status}`)
})
