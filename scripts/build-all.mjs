#!/usr/bin/env node
/**
 * 完整构建：Java JAR + Vite 前端。
 *
 * 标志：--skip-fe
 * 环境：SKIP_JAVA=true | SKIP_FE=true
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  ROOT_DIR,
  SERVER_DIR,
  buildJavaProcessEnv,
  loadMergedEnv,
  mvnCommand,
  resolveJavaHome,
  runCommand,
} from './build-shared.mjs'
import { buildDebugBreak } from './lib/build-debug.mjs'

const args = process.argv.slice(2)
const skipJava = process.env.SKIP_JAVA === 'true'
const skipFe = args.includes('--skip-fe') || process.env.SKIP_FE === 'true'

buildDebugBreak('build-all:start', { skipJava, skipFe })

try {
  const { loadedFiles, env: mergedEnv } = loadMergedEnv()
  if (loadedFiles.length > 0) {
    console.log(`📝 加载本地环境文件: ${loadedFiles.join(', ')}`)
  }

  if (!skipJava) {
    const javaHome = resolveJavaHome(mergedEnv)
    if (!javaHome) {
      console.error('❌ 找不到 Java 17，请设置 JAVA_HOME（或 SKIP_JAVA=true 跳过）')
      process.exit(1)
    }
    if (!existsSync(resolve(SERVER_DIR, 'pom.xml'))) {
      console.error(`❌ 找不到 ${SERVER_DIR}/pom.xml`)
      process.exit(1)
    }

    console.log('🔨 构建 Java 后端...')
    buildDebugBreak('build-all:before-java-mvn')
    console.log(`   JAVA_HOME: ${javaHome}`)
    runCommand(`${mvnCommand()} package -DskipTests -q`, {
      cwd: SERVER_DIR,
      env: buildJavaProcessEnv(javaHome, mergedEnv),
    })
    console.log('✅ Java 后端构建完成')
    buildDebugBreak('build-all:after-java-mvn')
  } else {
    console.log('\n⏭️  跳过 Java 构建')
  }

  if (!skipFe) {
    console.log('\n🔨 构建 Vite 前端...')
    buildDebugBreak('build-all:before-frontend')
    runCommand('node scripts/build-frontend.mjs', { cwd: ROOT_DIR, env: mergedEnv })
    console.log('✅ Vite 前端构建完成')
    buildDebugBreak('build-all:after-frontend')
  } else {
    console.log('\n⏭️  跳过前端构建')
  }

  console.log('\n🎉 构建完成！')
  if (!skipJava) console.log('   Java JAR: spark-ai-server/target/*.jar')
  if (!skipFe) console.log('   前端产物: dist/')
} catch (error) {
  console.error(`\n❌ 构建失败: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
