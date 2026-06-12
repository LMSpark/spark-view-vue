#!/usr/bin/env node

/**
 * Audit / apply MySQL cleanup for pageIds removed from Git pages-config.
 *
 * Source of truth: spark-ai-server/data/pages-config/deleted-pages.json
 * Production deploy: Flyway V9 (same pageId set)
 *
 * Usage:
 *   node scripts/migrate-pages-config-cleanup.mjs audit
 *   node scripts/migrate-pages-config-cleanup.mjs apply
 *
 * Env: MYSQL_JDBC_URL, MYSQL_USER, MYSQL_PASSWORD
 */

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const COMPOSE_FILE = resolve(ROOT, 'spark-ai-server', 'docker-compose.yml')
const DELETED_PAGES_PATH = resolve(ROOT, 'spark-ai-server', 'data', 'pages-config', 'deleted-pages.json')
const DEFAULT_JDBC = 'jdbc:mysql://127.0.0.1:3406/spark_ai?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false'

function loadDeletedPages() {
  const raw = JSON.parse(readFileSync(DELETED_PAGES_PATH, 'utf8'))
  const entries = raw.entries
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`${DELETED_PAGES_PATH} must define a non-empty entries array`)
  }
  for (const entry of entries) {
    if (!entry?.tenantId || !entry?.projectId || !entry?.pageId) {
      throw new Error('each deleted-pages entry requires tenantId, projectId, pageId')
    }
  }
  return entries
}

function sqlString(value) {
  return `'${String(value).replace(/'/gu, "''")}'`
}

export function buildCleanupScopeSubquery(entries) {
  const lines = entries.map((entry) => (
    `SELECT ${sqlString(entry.tenantId)} AS tenant_id, ${sqlString(entry.projectId)} AS project_id, ${sqlString(entry.pageId)} AS page_id`
  ))
  return lines.join('\n  UNION ALL\n  ')
}

function buildCountSql(tableAlias, joinClause) {
  const scope = buildCleanupScopeSubquery(loadDeletedPages())
  return `SELECT COUNT(*)
FROM ${tableAlias}
INNER JOIN (
  ${scope}
) cleanup_scope
  ON ${joinClause}`
}

export function buildApplyStatements(entries = loadDeletedPages()) {
  const scope = buildCleanupScopeSubquery(entries)
  const scopeTable = `(
  ${scope}
) cleanup_scope`

  return [
    `DELETE nav FROM NAVIGATION_NODE_FLAT nav
INNER JOIN ${scopeTable}
  ON nav.TENANT_ID = cleanup_scope.tenant_id
 AND nav.PROJECT_ID = cleanup_scope.project_id
 AND nav.PARENT_ID = cleanup_scope.page_id`,
    `DELETE nav FROM NAVIGATION_NODE_FLAT nav
INNER JOIN ${scopeTable}
  ON nav.TENANT_ID = cleanup_scope.tenant_id
 AND nav.PROJECT_ID = cleanup_scope.project_id
 AND (
   nav.NODE_ID = cleanup_scope.page_id
   OR nav.PATH = CONCAT('/', cleanup_scope.page_id)
   OR nav.REF_ID = cleanup_scope.page_id
 )`,
    `DELETE fv FROM file_version fv
INNER JOIN ${scopeTable}
  ON fv.tenant_id = cleanup_scope.tenant_id
 AND fv.project_id = cleanup_scope.project_id
 AND fv.page_id = cleanup_scope.page_id`,
    `DELETE pcf FROM page_config_file pcf
INNER JOIN ${scopeTable}
  ON pcf.tenant_id = cleanup_scope.tenant_id
 AND pcf.project_id = cleanup_scope.project_id
 AND pcf.page_id = cleanup_scope.page_id`,
  ]
}

function parseJdbcMysqlUrl(jdbcUrl) {
  const normalized = jdbcUrl.replace(/^jdbc:mysql:\/\//iu, 'http://')
  const url = new URL(normalized)
  const database = url.pathname.replace(/^\//u, '').split('?')[0]
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

function runMysqlCli(sql, config) {
  return spawnSync('mysql', [
    '-h', config.host,
    '-P', config.port,
    '-u', config.user,
    `-p${config.password}`,
    config.database,
    '-N',
    '-e',
    sql,
  ], {
    encoding: 'utf8',
    shell: false,
  })
}

function runDockerMysql(sql, config) {
  return spawnSync('docker', [
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
  ], {
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
  console.error('  2. Deploy backend to run Flyway V9')
  console.error('  3. Install mysql client and retry')
}

function auditCounts() {
  const entries = loadDeletedPages()
  return {
    entries: entries.length,
    pageConfigFiles: Number(runSql(buildCountSql('page_config_file pcf', [
      'pcf.tenant_id = cleanup_scope.tenant_id',
      'pcf.project_id = cleanup_scope.project_id',
      'pcf.page_id = cleanup_scope.page_id',
    ].join('\n AND ')), { capture: true }) || '0'),
    fileVersions: Number(runSql(buildCountSql('file_version fv', [
      'fv.tenant_id = cleanup_scope.tenant_id',
      'fv.project_id = cleanup_scope.project_id',
      'fv.page_id = cleanup_scope.page_id',
    ].join('\n AND ')), { capture: true }) || '0'),
    navigationNodes: Number(runSql(`SELECT COUNT(*)
FROM NAVIGATION_NODE_FLAT nav
INNER JOIN (
  ${buildCleanupScopeSubquery(entries)}
) cleanup_scope
  ON nav.TENANT_ID = cleanup_scope.tenant_id
 AND nav.PROJECT_ID = cleanup_scope.project_id
 AND (
   nav.NODE_ID = cleanup_scope.page_id
   OR nav.PATH = CONCAT('/', cleanup_scope.page_id)
   OR nav.REF_ID = cleanup_scope.page_id
   OR nav.PARENT_ID = cleanup_scope.page_id
 )`, { capture: true }) || '0'),
  }
}

async function main() {
  const mode = (process.argv[2] ?? 'audit').trim().toLowerCase()
  if (mode !== 'audit' && mode !== 'apply') {
    console.error('Usage: node scripts/migrate-pages-config-cleanup.mjs [audit|apply]')
    process.exit(1)
  }

  const deletedCount = loadDeletedPages().length
  console.log(`deleted-pages.json entries: ${deletedCount}`)

  const before = auditCounts()
  console.log(`page_config_file rows: ${before.pageConfigFiles}`)
  console.log(`file_version rows: ${before.fileVersions}`)
  console.log(`navigation_node_flat rows: ${before.navigationNodes}`)

  const total = before.pageConfigFiles + before.fileVersions + before.navigationNodes
  if (mode === 'audit') {
    if (total > 0) {
      console.log('Run with `apply` to delete, or deploy backend to run Flyway V9.')
      process.exit(1)
    }
    console.log('OK: no orphan rows for deleted pageIds.')
    process.exit(0)
  }

  if (total === 0) {
    console.log('OK: nothing to delete.')
    process.exit(0)
  }

  for (const statement of buildApplyStatements()) {
    runSql(statement)
  }

  const after = auditCounts()
  console.log(`after page_config_file rows: ${after.pageConfigFiles}`)
  console.log(`after file_version rows: ${after.fileVersions}`)
  console.log(`after navigation_node_flat rows: ${after.navigationNodes}`)

  const remaining = after.pageConfigFiles + after.fileVersions + after.navigationNodes
  if (remaining !== 0) {
    process.exit(1)
  }
  console.log('OK: DB cleanup complete.')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
