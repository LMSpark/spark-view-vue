#!/usr/bin/env node

/**
 * 全量导航迁移（前端/API 控制）
 * - 不改后端代码
 * - 通过 REST API 读取并回写导航树
 * - 一次性迁移到 nodeKind 新结构
 *
 * 用法：
 *   node scripts/migrate-nav-nodekind.mjs
 *   node scripts/migrate-nav-nodekind.mjs --dry-run
 *
 * 环境变量：
 *   API_BASE_URL=http://localhost:8080
 *   MIGRATION_USERNAME=admin
 *   MIGRATION_PASSWORD=admin123
 *   TENANT_FILTER=lmspark,foo
 *   PROJECT_FILTER=homepage,app1
 */

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:8080'
const MIGRATION_USERNAME = process.env['MIGRATION_USERNAME'] ?? 'admin'
const MIGRATION_PASSWORD = process.env['MIGRATION_PASSWORD'] ?? 'admin123'
const MIGRATION_BOOTSTRAP_TENANT = process.env['MIGRATION_BOOTSTRAP_TENANT'] ?? 'lmspark'
const TENANT_FILTER = new Set(
  String(process.env['TENANT_FILTER'] ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
)
const PROJECT_FILTER = new Set(
  String(process.env['PROJECT_FILTER'] ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
)
const DRY_RUN = process.argv.includes('--dry-run')

const SYSTEM_ROOT_IDS = new Set(['__toolbar__', '__user-menu__'])
const PAGE_LIKE_KINDS = new Set(['page', 'system-page', 'sub-page'])
const VALID_NODE_KINDS = new Set(['system-directory', 'module', 'system-page', 'page', 'sub-page'])
const VALID_CHILD_PLACEMENTS = new Set(['header', 'sidebar', 'toolbar', 'user-menu', 'parent', 'flat'])

function assertOk(response, bodyText) {
  if (response.ok) return
  throw new Error(`${response.status} ${response.statusText} ${bodyText}`.trim())
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  assertOk(response, text)
  if (!text) return null
  return JSON.parse(text)
}

function normalizePath(path) {
  if (typeof path !== 'string') return ''
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function classifyNodeKind(node, parentKind) {
  const rawKind = typeof node.nodeKind === 'string' ? node.nodeKind : ''
  let kind = VALID_NODE_KINDS.has(rawKind) ? rawKind : ''
  const id = String(node.id ?? '')

  if (!kind) {
    if (SYSTEM_ROOT_IDS.has(id) || node.childPlacement === 'toolbar' || node.childPlacement === 'user-menu') {
      kind = 'system-directory'
    } else if (typeof node.action === 'string' && node.action.trim()) {
      kind = 'system-page'
    } else if (node.type === 'group') {
      kind = 'module'
    } else {
      kind = 'page'
    }
  }

  if (parentKind && PAGE_LIKE_KINDS.has(parentKind) && kind === 'module') {
    kind = 'page'
  }

  return kind
}

function migrateNodeList(nodes, parentKind, stats) {
  const result = []
  let previous = null

  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') continue

    if (raw.type === 'divider') {
      stats.dividerRemoved += 1
      if (previous) {
        previous.dividerAfter = true
      }
      continue
    }

    const migrated = migrateNode(raw, parentKind, stats)
    result.push(migrated)
    previous = migrated
  }

  return result
}

function migrateNode(raw, parentKind, stats) {
  const node = raw
  const kind = classifyNodeKind(node, parentKind)
  const id = String(node.id ?? '').trim()
  const title = String(node.title ?? '').trim() || id

  const migrated = {
    id,
    type: kind === 'module' || kind === 'system-directory' ? 'group' : 'item',
    nodeKind: kind,
    title,
  }

  if (typeof node.icon === 'string' && node.icon.trim()) migrated.icon = node.icon.trim()
  if (typeof node.description === 'string' && node.description.trim()) migrated.description = node.description.trim()
  if (typeof node.order === 'number' && Number.isFinite(node.order)) migrated.order = node.order
  if (node.dividerAfter === true) migrated.dividerAfter = true
  if (node.disabled === true) migrated.disabled = true
  if (node.context !== undefined) migrated.context = node.context

  const rawPlacement = typeof node.childPlacement === 'string' ? node.childPlacement.trim() : ''
  const childPlacement = VALID_CHILD_PLACEMENTS.has(rawPlacement) ? rawPlacement : ''

  if (kind === 'system-directory' || kind === 'module') {
    if (id === '__toolbar__') {
      migrated.childPlacement = 'toolbar'
    } else if (id === '__user-menu__') {
      migrated.childPlacement = 'user-menu'
    } else if (childPlacement) {
      migrated.childPlacement = childPlacement
    }
    if (typeof node.redirect === 'string' && node.redirect.trim()) migrated.redirect = normalizePath(node.redirect)

    const children = migrateNodeList(Array.isArray(node.children) ? node.children : [], kind, stats)
    if (children.length > 0) migrated.children = children
  } else if (kind === 'sub-page') {
    migrated.hidden = true
    if (typeof node.parentPageId === 'string' && node.parentPageId.trim()) {
      migrated.parentPageId = node.parentPageId.trim()
    }
  } else {
    if (typeof node.path === 'string' && node.path.trim()) migrated.path = normalizePath(node.path)
    if (typeof node.redirect === 'string' && node.redirect.trim()) migrated.redirect = normalizePath(node.redirect)
    if (typeof node.externalUrl === 'string' && node.externalUrl.trim()) migrated.externalUrl = node.externalUrl.trim()
    if (typeof node.action === 'string' && node.action.trim()) migrated.action = node.action.trim()
    if (typeof node.parentPageId === 'string' && node.parentPageId.trim()) migrated.parentPageId = node.parentPageId.trim()
    if (node.hidden === true) migrated.hidden = true
    if (childPlacement && (childPlacement === 'parent' || childPlacement === 'flat')) {
      migrated.childPlacement = childPlacement
    }

    const children = migrateNodeList(Array.isArray(node.children) ? node.children : [], kind, stats)
    if (children.length > 0) migrated.children = children
  }

  stats.totalNodes += 1
  stats.kindCount[kind] = (stats.kindCount[kind] ?? 0) + 1
  return migrated
}

function migrateNavRoot(navRoot) {
  const stats = {
    totalNodes: 0,
    dividerRemoved: 0,
    kindCount: {},
  }

  const migrated = {
    childPlacement: navRoot?.childPlacement === 'sidebar' ? 'sidebar' : 'header',
    children: migrateNodeList(Array.isArray(navRoot?.children) ? navRoot.children : [], null, stats),
  }

  if (typeof navRoot?.homePath === 'string' && navRoot.homePath.trim()) {
    migrated.homePath = normalizePath(navRoot.homePath)
  }

  return { migrated, stats }
}

async function login(tenantId) {
  const data = await requestJson(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
    },
    body: JSON.stringify({
      tenantId,
      username: MIGRATION_USERNAME,
      password: MIGRATION_PASSWORD,
    }),
  })

  const token = data?.token
  if (!token) throw new Error(`tenant=${tenantId} 登录响应缺少 token`)
  return token
}

async function listTenantsWithAuth() {
  const candidates = TENANT_FILTER.size > 0
    ? Array.from(TENANT_FILTER)
    : [MIGRATION_BOOTSTRAP_TENANT]

  for (const tenantId of candidates) {
    try {
      const token = await login(tenantId)
      const tenants = await requestJson(`${API_BASE_URL}/api/tenants`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Id': tenantId,
          'X-Project-Id': 'homepage',
        },
      })
      if (Array.isArray(tenants) && tenants.length > 0) {
        return tenants
      }
    } catch {
      // 尝试下一个候选租户
    }
  }

  if (TENANT_FILTER.size > 0) {
    return Array.from(TENANT_FILTER).map((tenantId) => ({ tenantId }))
  }

  return [{ tenantId: MIGRATION_BOOTSTRAP_TENANT }]
}

function createHeaders(token, tenantId, projectId) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    'X-Project-Id': projectId,
  }
}

async function migrateProject(tenantId, projectId, token) {
  const headers = createHeaders(token, tenantId, projectId)
  const navUrl = `${API_BASE_URL}/api/tenants/${encodeURIComponent(tenantId)}/projects/${encodeURIComponent(projectId)}/navigation`
  const navRoot = await requestJson(navUrl, { headers })

  const { migrated, stats } = migrateNavRoot(navRoot)
  const before = JSON.stringify(navRoot)
  const after = JSON.stringify(migrated)
  const changed = before !== after

  if (!DRY_RUN && changed) {
    await requestJson(navUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(migrated),
    })
  }

  return {
    changed,
    stats,
  }
}

async function main() {
  console.log(`[migrate-nav-nodekind] base=${API_BASE_URL} dryRun=${DRY_RUN}`)

  const tenants = await listTenantsWithAuth()
  if (!Array.isArray(tenants) || tenants.length === 0) {
    console.log('[migrate-nav-nodekind] 未发现租户，结束')
    return
  }

  let totalProjects = 0
  let changedProjects = 0

  for (const tenant of tenants) {
    const tenantId = String(tenant?.tenantId ?? '').trim()
    if (!tenantId) continue
    if (TENANT_FILTER.size > 0 && !TENANT_FILTER.has(tenantId)) continue

    let token
    try {
      token = await login(tenantId)
    } catch (error) {
      console.warn(`[skip] tenant=${tenantId} 登录失败: ${String(error)}`)
      continue
    }

    const projects = await requestJson(`${API_BASE_URL}/api/tenants/${encodeURIComponent(tenantId)}/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
      },
    })

    if (!Array.isArray(projects) || projects.length === 0) {
      console.log(`[tenant=${tenantId}] 无项目`)
      continue
    }

    for (const project of projects) {
      const projectId = String(project?.projectId ?? '').trim()
      if (!projectId) continue
      if (PROJECT_FILTER.size > 0 && !PROJECT_FILTER.has(projectId)) continue

      totalProjects += 1
      try {
        const result = await migrateProject(tenantId, projectId, token)
        if (result.changed) changedProjects += 1
        console.log(
          `[${result.changed ? 'changed' : 'same'}] ${tenantId}/${projectId} nodes=${result.stats.totalNodes} dividerRemoved=${result.stats.dividerRemoved}`,
        )
      } catch (error) {
        console.error(`[error] ${tenantId}/${projectId}: ${String(error)}`)
      }
    }
  }

  console.log(`[migrate-nav-nodekind] done totalProjects=${totalProjects} changedProjects=${changedProjects} dryRun=${DRY_RUN}`)
}

main().catch((error) => {
  console.error('[migrate-nav-nodekind] failed:', error)
  process.exitCode = 1
})
