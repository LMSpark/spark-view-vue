import { execSync } from 'child_process'

try {
  console.log('Building spark-utils...')
  const result = execSync('npx tsc -p packages/spark-utils/tsconfig.build.json', {
    cwd: 'd:\\SPARK_VIEW',
    encoding: 'utf-8',
    stdio: 'pipe'
  })
  console.log(result)
  console.log('Build complete!')
} catch (error) {
  console.error('Build failed:')
  console.error(error.stdout)
  console.error(error.stderr)
  process.exit(1)
}
