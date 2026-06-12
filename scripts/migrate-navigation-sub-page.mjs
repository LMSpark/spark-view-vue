#!/usr/bin/env node

/**
 * Audit / apply legacy navigation NODE_KIND='sub-page' migration in MySQL.
 *
 * Production: Flyway V8 on deploy (spring.flyway.enabled=true).
 * Local dev: `pnpm run migrate:navigation:sub-page -- apply`
 *
 * Transport (first available):
 *   1. mysql CLI on PATH
 *   2. docker compose exec mysql (spark-ai-server/docker-compose.yml)
 *
 * Usage:
 *   node scripts/migrate-navigation-sub-page.mjs audit
 *   node scripts/migrate-navigation-sub-page.mjs apply
 *
 * Env: MYSQL_JDBC_URL, MYSQL_USER, MYSQL_PASSWORD
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const ROOT = resolve(import.meta.dirname, '..')
const COMPOSE_FILE = resolve(ROOT, 'spark-ai-server', 'docker-compose.yml')
const DEFAULT_JDBC = 'jdbc:mysql://127.0.0.1:3406/spark_ai?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false'

const COUNT_SQL = "SELECT COUNT(*) FROM NAVIGATION_NODE_FLAT WHERE NODE_KIND = 'sub-page'"

const APPLY_SQL = `UPDATE NAVIGATION_NODE_FLAT
SET NODE_KIND = 'page',
    HIDDEN = TRUE,
    PATH = NULL,
    UPDATED_AT = CURRENT_TIMESTAMP(6)
WHERE NODE_KIND = 'sub-page'`

function parseJdbcMysqlUrl(jdbcUrl) {
  const normalized = jdbcUrl.replace(/^jdbc:mysql:\/\//i, 'http://')
  const url = new URL(normalized)
  const database = url.pathname.replace(/^\//, '').split('?')[0]
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '3306',
    database,
  }
}

function commandExists(command) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf8',
    shell: false,
  })
  return probe.status === 0
}

function dockerComposeAvailable() {
  if (!commandExists('docker')) return false
  const probe = spawnSync('docker', ['compose', 'version'], {
    encoding: 'utf8',
    shell: false,
  })
  return probe.status === 0 && existsSync(COMPOSE_FILE)
}

function runMysqlCli(sql, config, { capture = false } = {}) {
  const args = [
    '-h', config.host,
    '-P', config.port,
    '-u', config.user,
    `-p${config.password}`,
    config.database,
    '-N',
    '-e',
    sql,
  ]

  return spawnSync('mysql', args, {
    encoding: 'utf8',
    shell: false,
  })
}

function runDockerMysql(sql, config, { capture = false } = {}) {
  const args = [
    'compose',
    '-f', COMPOSE_FILE,
    'exec',
    '-T',
    'mysql',
    'mysql',
    '-h', '127.0.0.1',
    '-P', config.port,
    '-u', config.user,
    `-p${config.password}`,
    config.database,
    '-N',
    '-e',
    sql,
  ]

  return spawnSync('docker', args, {
    encoding: 'utf8',
    cwd: ROOT,
    shell: false,
  })
}

function runSql(sql, { capture = false } = {}) {
  const jdbcUrl = process.env.MYSQL_JDBC_URL ?? DEFAULT_JDBC
  const config = {
    ...parseJdbcMysqlUrl(jdbcUrl),
    user: process.env.MYSQL_USER ?? 'spark',
    password: process.env.MYSQL_PASSWORD ?? 'spark',
  }

  let transport = 'mysql-cli'
  let result = commandExists('mysql')
    ? runMysqlCli(sql, config)
    : { status: 127, error: new Error('mysql CLI not found') }

  if (result.error || result.status !== 0) {
    if (dockerComposeAvailable()) {
      transport = 'docker-compose'
      result = runDockerMysql(sql, config)
    }
  }

  if (result.error) {
    console.error(`SQL transport failed (${transport}): ${result.error.message}`)
    printFallbackInstructions()
    process.exit(2)
  }

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim()
    console.error(`SQL failed (${transport}): ${stderr || `exit ${result.status}`}`)
    printFallbackInstructions()
    process.exit(result.status ?? 1)
  }

  if (capture) {
    return (result.stdout ?? '').trim()
  }

  if ((result.stdout ?? '').trim()) {
    process.stdout.write(result.stdout)
  }
  return ''
}

function printFallbackInstructions() {
  console.error('')
  console.error('Manual options:')
  console.error('  1. Start MySQL: pnpm run dev (or docker compose -f spark-ai-server/docker-compose.yml up -d mysql)')
  console.error('  2. Run Flyway V8 SQL from spark-ai-server/src/main/resources/db/migration/V8__migrate_navigation_sub_page.sql')
  console.error('  3. Install mysql client and retry')
}

async function main() {
  const mode = (process.argv[2] ?? 'audit').trim().toLowerCase()
  if (mode !== 'audit' && mode !== 'apply') {
    console.error('Usage: node scripts/migrate-navigation-sub-page.mjs [audit|apply]')
    process.exit(1)
  }

  const before = Number(runSql(COUNT_SQL, { capture: true }) || '0')
  console.log(`legacy sub-page rows: ${before}`)

  if (mode === 'audit') {
    if (before > 0) {
      console.log('Run with `apply` to migrate, or deploy backend to run Flyway V8.')
      process.exit(1)
    }
    console.log('OK: no legacy sub-page rows.')
    process.exit(0)
  }

  if (before === 0) {
    console.log('OK: nothing to migrate.')
    process.exit(0)
  }

  runSql(APPLY_SQL)
  const after = Number(runSql(COUNT_SQL, { capture: true }) || '0')
  console.log(`migrated rows: ${before - after}; remaining sub-page rows: ${after}`)

  if (after !== 0) {
    process.exit(1)
  }
  console.log('OK: migration complete.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
