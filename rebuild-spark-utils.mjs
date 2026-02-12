import { rmSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'

const sparkUtilsDir = join('d:',  'SPARK_VIEW', 'packages', 'spark-utils')
const distDir = join(sparkUtilsDir, 'dist')

console.log('清理 dist 目录...')
try {
  rmSync(distDir, { recursive: true, force: true })
  console.log('dist 目录已删除')
} catch (e) {
  console.log('dist 目录不存在或已删除')
}

console.log('开始编译 spark-utils...')
try {
  execSync('npx tsc -p tsconfig.build.json', {
    cwd: sparkUtilsDir,
    stdio: 'inherit'
  })
  console.log('✅ 编译完成！')
} catch (error) {
  console.error('❌ 编译失败')
  process.exit(1)
}
