/**
 * ESLint问题修复脚本
 * 批量修复console语句和未使用变量
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const fixes = [
  // bootstrap/index.ts - 未使用的类型
  {
    file: 'packages/spark-app/src/bootstrap/index.ts',
    search: "import type { App as VueApp } from 'vue'\nimport type { Router as VueRouter } from 'vue'",
    replace: "import type { App } from 'vue'\nimport type { Router } from 'vue'"
  },
  // namespace.ts - 未使用的ConfigLoader
  {
    file: 'packages/spark-page-config/src/namespace.ts',
    search: 'import type {\n  ConfigLoader,\n  DynamicRouter,',
    replace: 'import type {\n  DynamicRouter,'
  },
  // useScriptSandbox.ts - 未使用的导入和函数
  {
    file: 'packages/spark-renderer/src/composables/useScriptSandbox.ts',
    search: "import type { PageScriptModule } from '../types'",
    replace: "// import type { PageScriptModule } from '../types'"
  },
  {
    file: 'packages/spark-renderer/src/composables/useScriptSandbox.ts',
    search: '  const cleanupGlobalPageContext = () => {',
    replace: '  const _cleanupGlobalPageContext = () => {'
  }
]

// 执行修复
fixes.forEach(({ file, search, replace }) => {
  const filePath = path.join(rootDir, file)
  try {
    let content = fs.readFileSync(filePath, 'utf-8')
    if (content.includes(search)) {
      content = content.replace(search, replace)
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`✓ Fixed: ${file}`)
    } else {
      console.log(`⚠ Not found in ${file}`)
    }
  } catch (error) {
    console.error(`✗ Error fixing ${file}:`, error.message)
  }
})

console.log('\nDone!')
