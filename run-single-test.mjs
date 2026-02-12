import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function runTest() {
  try {
    const { stdout, stderr } = await execAsync(
      'npx vitest run tests/api-adapter-request.test.ts --reporter=verbose --no-watch --run',
      { cwd: 'd:\\SPARK_VIEW', maxBuffer: 1024 * 1024 * 10 }
    )
    console.log(stdout)
    if (stderr) console.error(stderr)
  } catch (error) {
    console.log(error.stdout)
    console.error(error.stderr)
    process.exit(error.code || 1)
  }
}

runTest()
