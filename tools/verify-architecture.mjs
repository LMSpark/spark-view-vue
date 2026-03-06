#!/usr/bin/env node
/**
 * 架构验证脚本 - 确保主项目采用 L3 层包实现
 * 
 * 验证规则：
 * 1. src/ 不应该包含渲染逻辑（由 L3 包提供）
 * 2. src/ 只能导入 L1-L3 包，不能有自己的实现
 * 3. features/ 只能在 tests/ 中使用
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = join(__filename, '..')
const rootDir = join(__dirname, '..')

console.log('🔍 验证架构合规性...\n')

let errors = 0

/**
 * 递归扫描目录
 */
function* scanFiles(dir, extensions = ['.ts', '.vue', '.js']) {
  const entries = readdirSync(dir)
  
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', '.git'].includes(entry)) {
        yield* scanFiles(fullPath, extensions)
      }
    } else if (extensions.some(ext => entry.endsWith(ext))) {
      yield fullPath
    }
  }
}

/**
 * 检查文件内容
 */
function checkFile(filePath, rules) {
  const content = readFileSync(filePath, 'utf-8')
  const relativePath = relative(rootDir, filePath)
  
  for (const { pattern, message, severity = 'error' } of rules) {
    const matches = content.match(pattern)
    if (matches) {
      if (severity === 'error') {
        console.error(`❌ ${relativePath}`)
        console.error(`   ${message}`)
        console.error(`   匹配: ${matches[0].substring(0, 60)}...\n`)
        errors++
      } else {
        console.warn(`⚠️  ${relativePath}`)
        console.warn(`   ${message}`)
        console.warn(`   匹配: ${matches[0].substring(0, 60)}...\n`)
      }
    }
  }
}

// ============================================================================
// 规则 1: src/ 不应该有渲染逻辑实现
// ============================================================================

console.log('📋 规则 1: src/ 不应该实现渲染逻辑\n')

const srcFiles = Array.from(scanFiles(join(rootDir, 'src')))

for (const file of srcFiles) {
  checkFile(file, [
    {
      pattern: /class\s+\w*Renderer/,
      message: '不应该实现 Renderer 类（应使用 @spark-view/spark-component）'
    },
    {
      pattern: /function\s+render[A-Z]\w*/,
      message: '不应该实现 render* 函数（应使用 @spark-view/spark-component）'
    },
    {
      pattern: /function\s+compileTemplate/,
      message: '不应该实现模板编译（应使用 @spark-view/spark-component）'
    },
    {
      pattern: /function\s+createSandbox/,
      message: '不应该实现沙箱（应使用 @spark-view/spark-component）'
    }
  ])
}

// ============================================================================
// 规则 2: src/ 应该只使用包，不导入 features（features 内部自引用除外）
// ============================================================================

console.log('📋 规则 2: src/ 不应该导入 features\n')

for (const file of srcFiles) {
  // features 目录内部的文件可以互相引用，跳过检查
  const relativePath = relative(rootDir, file)
  if (relativePath.includes('features')) continue
  
  checkFile(file, [
    {
      pattern: /from\s+['"]@\/features/,
      message: '不应该从 features 导入（features 只用于测试）'
    },
    {
      pattern: /from\s+['"]\.\.?\/features/,
      message: '不应该从 features 导入（features 只用于测试）'
    }
  ])
}

// ============================================================================
// 规则 3: 测试文件可以使用 features
// ============================================================================

console.log('📋 规则 3: 验证测试文件正确使用 features\n')

const testFiles = Array.from(scanFiles(join(rootDir, 'tests')))

let hasFeatureImport = false
for (const file of testFiles) {
  const content = readFileSync(file, 'utf-8')
  if (content.includes('features/spark-ej2')) {
    hasFeatureImport = true
    break
  }
}

if (hasFeatureImport) {
  console.log('✅ 测试文件正确使用 features/spark-ej2\n')
} else {
  console.warn('⚠️  测试文件未使用 features（可能已废弃）\n')
}

// ============================================================================
// 规则 4: 验证包之间的合理依赖
// ============================================================================

console.log('📋 规则 4: 验证包依赖合理性\n')

const packagesDir = join(rootDir, 'packages')
const packageNames = readdirSync(packagesDir).filter(name => 
  statSync(join(packagesDir, name)).isDirectory()
)

// 依赖方向严格单向向上（与 copilot-instructions.md 一致）
//
// spark-utils          ← 零依赖（基础设施底层，纯 TS）
//     ↑
// spark-data           ← 仅依赖 spark-utils（纯 TS）
//     ↑
// spark-page-config    ← 仅依赖 spark-data + spark-utils（纯 TS）
//     ↑
// spark-component      ← 依赖 spark-data + spark-page-config + spark-utils（+ Vue/Element Plus peerDeps）
//     ↑
// spark-app            ← 依赖 spark-component + spark-page-config + spark-utils（+ Vue/vue-router peerDeps）
//
// 禁止反向依赖：
// - spark-utils 禁止 import spark-data / spark-component / spark-app
// - spark-data 禁止 import spark-component / spark-app
// - spark-page-config 禁止 import spark-component / spark-app
// - spark-component 禁止 import spark-app

const allowedDeps = {
  'spark-utils': [],                                             // 工具层，零依赖
  'spark-data': ['spark-utils'],                                 // 仅依赖 utils
  'spark-page-config': ['spark-utils', 'spark-data'],            // 依赖 utils + data
  'spark-component': ['spark-utils', 'spark-data', 'spark-page-config'], // 依赖 utils + data + page-config
  'spark-app': ['spark-utils', 'spark-page-config', 'spark-component'],  // 依赖 utils + page-config + component
}

for (const pkgName of packageNames) {
  const pkgSrcDir = join(packagesDir, pkgName, 'src')
  if (!statSync(pkgSrcDir).isDirectory()) continue
  
  const pkgFiles = Array.from(scanFiles(pkgSrcDir))
  const allowed = allowedDeps[pkgName] || []
  
  for (const file of pkgFiles) {
    const content = readFileSync(file, 'utf-8')
    const relativePath = relative(rootDir, file)
    
    // 检查是否导入了不允许的包
    for (const depName of packageNames) {
      if (depName === pkgName) continue
      if (allowed.includes(depName)) continue
      
      const importPattern = new RegExp(`from\\s+['"]@spark-view/${depName}`)
      if (importPattern.test(content)) {
        console.error(`❌ ${relativePath}`)
        console.error(`   ${pkgName} 不应该依赖 ${depName}`)
        console.error(`   允许的依赖: [${allowed.join(', ') || '无'}]\n`)
        errors++
      }
    }
  }
}

console.log('✅ 包依赖检查完成\n')

// ============================================================================
// 总结
// ============================================================================

console.log('━'.repeat(60))
if (errors === 0) {
  console.log('✅ 架构验证通过！主项目正确采用包架构实现\n')
  console.log('包依赖关系：')
  console.log('  ┌─ spark-utils (工具层 - Logger, 常量, 符号)')
  console.log('  │')
  console.log('  ├─ spark-app (基础设施)')
  console.log('  ├── spark-data (数据管理)')
  console.log('  ├── spark-component (组件系统 + 页面渲染引擎 ⭐)')
  console.log('  ├── spark-page-config (页面配置)')
  console.log('  └── spark-data (数据管理)')
  console.log('')
  console.log('主应用 (src/) 使用：')
  console.log('  • PageRenderer from @spark-view/spark-component')
  console.log('  • SparkApp from @spark-view/spark-app')
  console.log('')
  process.exit(0)
} else {
  console.error(`❌ 发现 ${errors} 个架构问题\n`)
  process.exit(1)
}
