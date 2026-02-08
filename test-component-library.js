// test-component-library.js
/**
 * 测试组件库功能
 */

import { readFileSync } from 'fs'

console.log('🚀 测试组件库功能')
console.log('')

try {
  // 加载组件库
  const library = JSON.parse(readFileSync('component-library.json', 'utf-8'))
  console.log('📚 加载组件库成功:', Object.keys(library).length, '个组件')
  console.log('')

  // 模拟 getComponentInfo
  console.log('🔍 模拟 getComponentInfo:')
  const gridInfo = library['SparkEJ2Grid']
  if (gridInfo) {
    console.log('  SparkEJ2Grid:', gridInfo.props?.length, 'props,', gridInfo.events?.length, 'events,', gridInfo.isMock ? '(Mock)' : '(Real)')
  } else {
    console.log('  SparkEJ2Grid: 未找到')
  }
  console.log('')

  // 模拟 searchComponents
  console.log('🔍 模拟 searchComponents:')
  const searchResults = Object.entries(library).filter(([name, meta]) =>
    name.toLowerCase().includes('spark') ||
    meta.description?.toLowerCase().includes('spark')
  )
  console.log('  搜索 "Spark":', searchResults.length, '个结果')
  searchResults.slice(0, 3).forEach(([name, meta]) => console.log('    -', name, meta.isMock ? '(Mock)' : '(Real)'))
  console.log('')

  // 模拟 getComponentRecommendations
  console.log('🔍 模拟 getComponentRecommendations:')
  const recommendations = Object.entries(library)
    .map(([name, meta]) => ({ name, meta, score: name.includes('Grid') ? 10 : 0 }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
  console.log('  推荐 "显示数据表格":', recommendations.length, '个结果')
  recommendations.slice(0, 3).forEach(r => console.log('    -', r.name, '(score:', r.score, ')', r.meta.isMock ? '(Mock)' : '(Real)'))

  console.log('')
  console.log('✅ 组件库功能测试完成')

} catch (error) {
  console.error('❌ 测试失败:', error.message)
}