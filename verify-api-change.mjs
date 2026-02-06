#!/usr/bin/env node
/**
 * 验证API修改 - 确保VueSparkPlugin不再需要manager参数
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

console.log('🔍 验证 VueSparkPlugin API 修改...\n')

// 检查VueSparkPlugin.ts
const pluginPath = join(__dirname, 'packages/spark-component/src/plugins/VueSparkPlugin.ts')
const pluginContent = readFileSync(pluginPath, 'utf-8')

console.log('✓ 检查接口定义...')
if (pluginContent.includes('manager?: ComponentManager')) {
  console.error('❌ VueSparkPluginOptions 仍然包含 manager 参数')
  process.exit(1)
}
if (!pluginContent.includes('registry?: ComponentRegistry')) {
  console.error('❌ VueSparkPluginOptions 缺少 registry 参数')
  process.exit(1)
}
console.log('  ✓ VueSparkPluginOptions 只包含 registry 参数\n')

console.log('✓ 检查实现逻辑...')
if (!pluginContent.includes('createComponentManager')) {
  console.error('❌ 未导入 createComponentManager')
  process.exit(1)
}
if (!pluginContent.includes('options?.registry ? createComponentManager(undefined, registry) : defaultManager')) {
  console.error('❌ manager 创建逻辑不正确')
  process.exit(1)
}
console.log('  ✓ Manager 自动创建逻辑正确\n')

console.log('✓ 检查文档注释...')
if (!pluginContent.includes('业务开发者只需关心 Registry')) {
  console.error('❌ 缺少设计理念说明')
  process.exit(1)
}
console.log('  ✓ 文档注释符合设计理念\n')

// 检查测试文件
const testPath = join(__dirname, 'packages/spark-component/tests/vue-plugin.test.ts')
const testContent = readFileSync(testPath, 'utf-8')

console.log('✓ 检查测试文件...')
if (testContent.includes('createVuePlugin({ manager')) {
  console.error('❌ 测试文件仍在使用 manager 参数')
  process.exit(1)
}
if (!testContent.includes('createVuePlugin()') || !testContent.includes('createVuePlugin({ registry })')) {
  console.error('❌ 测试文件未覆盖新API用法')
  process.exit(1)
}
console.log('  ✓ 测试文件已更新\n')

// 检查文档
const readmePath = join(__dirname, 'packages/spark-component/README.md')
const readmeContent = readFileSync(readmePath, 'utf-8')

console.log('✓ 检查README...')
if (readmeContent.includes('createVuePlugin({ manager')) {
  console.error('❌ README 仍在展示旧API')
  process.exit(1)
}
console.log('  ✓ README 已更新\n')

console.log('✅ 所有检查通过！\n')
console.log('📝 API 修改总结：')
console.log('  - VueSparkPluginOptions 移除 manager 参数')
console.log('  - Manager 由框架自动创建和管理')
console.log('  - 业务开发者只需关心注册组件（Registry）')
console.log('  - 更简单的API：app.use(Spark.createVuePlugin())')
