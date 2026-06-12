#!/usr/bin/env node

/**
 * Audit / apply legacy navigation NODE_KIND='sub-page' migration in MySQL.
 *
 * Production: prefer Flyway V8__migrate_navigation_sub_page.sql on deploy.
 * Local dev (Flyway disabled): run `pnpm run migrate:navigation:sub-page -- apply`.
 *
 * Usage:
 *   node scripts/migrate-navigation-sub-page.mjs audit
 *   node scripts/migrate-navigation-sub-page.mjs apply
 *
 * Env (defaults match application-dev.yml):
 *   MYSQL_JDBC_URL, MYSQL_USER, MYSQL_PASSWORD
 */

import { spawnSync } from 'node:child_process'
import process from 'node:process'

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

function runMysql(sql, { capture = false } = {}) {
  const jdbcUrl = process.env.MYSQL_JDBC_URL ?? DEFAULT_JDBC
  const user = process.env.MYSQL_USER ?? 'spark'
  const password = process.env.MYSQL_PASSWORD ?? 'spark'
  const { host, port, database } = parseJdbcMysqlUrl(jdbcUrl)

  const args = [
    '-h', host,
    '-P', port,
    '-u', user,
    `-p${password}`,
    database,
    '-N',
    '-e',
    sql,
  ]

  const result = spawnSync('mysql', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  if (result.error) {
    console.error(`mysql CLI failed: ${result.error.message}`)
    console.error('Install MySQL client or run Flyway V8 on prod deploy.')
    console.error('SQL:', APPLY_SQL)
    process.exit(2)
  }

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim()
    console.error(stderr || `mysql exited with code ${result.status}`)
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

async function main() {
  const mode = (process.argv[2] ?? 'audit').trim().toLowerCase()
  if (mode !== 'audit' && mode !== 'apply') {
    console.error('Usage: node scripts/migrate-navigation-sub-page.mjs [audit|apply]')
    process.exit(1)
  }

  const before = Number(runMysql(COUNT_SQL, { capture: true }) || '0')
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

  runMysql(APPLY_SQL)
  const after = Number(runMysql(COUNT_SQL, { capture: true }) || '0')
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
